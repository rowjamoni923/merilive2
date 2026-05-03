import { useState, useEffect } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Gift, Calendar, ArrowLeft, Coins, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { recordAdminError } from "@/utils/adminErrorLog";

interface ClaimRecord {
  id: string;
  user_id: string;
  task_id: string;
  claimed_at: string;
  current_progress: number;
  task_title: string;
  reward_beans: number;
  reward_coins: number;
  target_audience: string;
  user_name: string;
  user_avatar: string;
  user_uid: string;
}

interface HostSummary {
  user_id: string;
  user_name: string;
  user_avatar: string;
  user_uid: string;
  total_beans: number;
  total_coins: number;
  total_claims: number;
  claims: ClaimRecord[];
}

const AdminRewardClaimsHistory = () => {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');

  useEffect(() => {
    fetchClaims();
  }, [dateFilter]);

  useAdminRealtime(['user_task_progress', 'daily_tasks'], () => fetchClaims());

  const getResetDateRange = (): { startDate: string; endDate: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    switch (dateFilter) {
      case 'today':
        return { startDate: todayStr, endDate: todayStr };
      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        return { startDate: yStr, endDate: yStr };
      }
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { startDate: weekAgo.toISOString().split('T')[0], endDate: todayStr };
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return { startDate: monthAgo.toISOString().split('T')[0], endDate: todayStr };
      }
      default:
        return { startDate: todayStr, endDate: todayStr };
    }
  };

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getResetDateRange();
      
      // Use reset_date column for accurate per-day filtering (avoids timezone overlap)
      const { data: taskData, error: taskError } = await supabase
        .from('user_task_progress')
        .select('id, user_id, task_id, claimed_at, current_progress, reset_date')
        .eq('is_claimed', true)
        .gte('reset_date', startDate)
        .lte('reset_date', endDate)
        .order('claimed_at', { ascending: false })
        .limit(500);

      if (taskError) throw taskError;
      if (!taskData || taskData.length === 0) {
        setClaims([]);
        setLoading(false);
        return;
      }

      // Get unique task IDs and user IDs
      const taskIds = [...new Set(taskData.map(t => t.task_id))];
      const userIds = [...new Set(taskData.map(t => t.user_id))];

      // Fetch task details and user profiles in parallel
      const [tasksRes, profilesRes] = await Promise.all([
        supabase.from('daily_tasks').select('id, title, reward_beans, reward_coins, target_audience').in('id', taskIds),
        supabase.from('profiles').select('id, display_name, avatar_url, app_uid').in('id', userIds),
      ]);

      const tasksMap = new Map((tasksRes.data || []).map(t => [t.id, t]));
      const profilesMap = new Map((profilesRes.data || []).map(p => [p.id, p]));

      const enriched: ClaimRecord[] = taskData.map(claim => {
        const task = tasksMap.get(claim.task_id);
        const profile = profilesMap.get(claim.user_id);
        return {
          id: claim.id,
          user_id: claim.user_id,
          task_id: claim.task_id,
          claimed_at: claim.claimed_at,
          current_progress: claim.current_progress,
          task_title: task?.title || 'Unknown Task',
          reward_beans: task?.reward_beans || 0,
          reward_coins: task?.reward_coins || 0,
          target_audience: task?.target_audience || 'all',
          user_name: profile?.display_name || 'Unknown',
          user_avatar: profile?.avatar_url || '',
          user_uid: profile?.app_uid || '',
        };
      });

      setClaims(enriched);
    } catch (error) {
      console.error('Failed to fetch claims:', error);
      recordAdminError({ kind: "rpc", label: "AdminRewardClaimsHistory.profile", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  // Group by host for summary view
  const hostSummaries: HostSummary[] = (() => {
    const map = new Map<string, HostSummary>();
    
    const filtered = claims.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.user_name.toLowerCase().includes(q) || c.user_uid.toLowerCase().includes(q);
    });

    filtered.forEach(claim => {
      const existing = map.get(claim.user_id);
      if (existing) {
        existing.total_beans += claim.reward_beans;
        existing.total_coins += claim.reward_coins;
        existing.total_claims += 1;
        existing.claims.push(claim);
      } else {
        map.set(claim.user_id, {
          user_id: claim.user_id,
          user_name: claim.user_name,
          user_avatar: claim.user_avatar,
          user_uid: claim.user_uid,
          total_beans: claim.reward_beans,
          total_coins: claim.reward_coins,
          total_claims: 1,
          claims: [claim],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total_beans - a.total_beans);
  })();

  const totalBeans = hostSummaries.reduce((sum, h) => sum + h.total_beans, 0);
  const totalClaims = claims.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.user_name.toLowerCase().includes(q) || c.user_uid.toLowerCase().includes(q);
  }).length;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            🎁 Reward Claims History
          </h1>
          <p className="text-sm text-muted-foreground">Host task reward claim history</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Hosts</p>
            <p className="text-2xl font-bold text-amber-400">{hostSummaries.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Claims</p>
            <p className="text-2xl font-bold text-purple-400">{totalClaims}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Beans</p>
            <p className="text-2xl font-bold text-green-400">{totalBeans.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'summary' | 'detail')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="summary">By Host</SelectItem>
            <SelectItem value="detail">All Claims</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : hostSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No reward claims found for this period</p>
          </CardContent>
        </Card>
      ) : viewMode === 'summary' ? (
        <div className="space-y-3">
          {hostSummaries.map((host, index) => (
            <Card key={host.user_id} className="overflow-hidden hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    index === 1 ? 'bg-gray-400/20 text-gray-300' :
                    index === 2 ? 'bg-amber-700/20 text-amber-600' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    #{index + 1}
                  </div>

                  {/* Avatar */}
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={host.user_avatar} />
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{host.user_name}</p>
                    <p className="text-xs text-muted-foreground">UID: {host.user_uid}</p>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <Coins className="h-3.5 w-3.5 text-amber-400" />
                      <span className="font-bold text-amber-400">{host.total_beans.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{host.total_claims} tasks</p>
                  </div>
                </div>

                {/* Task breakdown */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {host.claims.map(claim => (
                    <Badge key={claim.id} variant="secondary" className="text-[10px] gap-1">
                      {claim.task_title} • {claim.reward_beans.toLocaleString()}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {claims
            .filter(c => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return c.user_name.toLowerCase().includes(q) || c.user_uid.toLowerCase().includes(q);
            })
            .map(claim => (
              <Card key={claim.id} className="overflow-hidden">
                <CardContent className="p-3 flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={claim.user_avatar} />
                    <AvatarFallback><User className="h-3 w-3" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{claim.user_name}</p>
                    <p className="text-[10px] text-muted-foreground">UID: {claim.user_uid}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{claim.task_title}</Badge>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-amber-400">{claim.reward_beans.toLocaleString()}</span>
                    <p className="text-[10px] text-muted-foreground">
                      {claim.claimed_at ? format(new Date(claim.claimed_at), 'HH:mm') : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
};

export default AdminRewardClaimsHistory;
