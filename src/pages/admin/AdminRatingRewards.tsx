import { useState, useEffect, useCallback } from 'react';
import { Star, CheckCircle, XCircle, Clock, User, Image, Search, RefreshCw, Eye, History, ArrowRight, Diamond, Bean, Power } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { toast } from 'sonner';
import { useAdminRealtime } from '@/hooks/useAdminRealtime';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";

import { formatAdminError } from "@/utils/formatAdminError";
interface RatingClaim {
  id: string;
  user_id: string;
  screenshot_url: string;
  screenshot_signed?: string | null;
  status: string;
  reward_type: string;
  reward_amount: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    gender: string | null;
  };
  reviewer?: {
    display_name: string | null;
    email: string | null;
  };
}

export default function AdminRatingRewards() {
  const [claims, setClaims] = useState<RatingClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all' | 'history'>('pending');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [ratingEnabled, setRatingEnabled] = useState(false);
  const [togglingRating, setTogglingRating] = useState(false);

  // Transaction history state (separate from claims)
  const [historyData, setHistoryData] = useState<RatingClaim[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch rating popup toggle state
  useEffect(() => {
    const fetchToggle = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'rating_popup_enabled')
        .maybeSingle();
      setRatingEnabled(data?.setting_value === true || data?.setting_value === 'true');
    };
    fetchToggle();
  }, []);

  const toggleRatingPopup = async (enabled: boolean) => {
    setTogglingRating(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ setting_value: enabled ? 'true' : 'false' })
        .eq('setting_key', 'rating_popup_enabled');
      if (error) throw error;
      setRatingEnabled(enabled);
      toast.success(`Rating popup ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to update setting');
    } finally {
      setTogglingRating(false);
    }
  };

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rating_reward_claims')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all' && filter !== 'history') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(c => c.user_id))];
        const reviewerIds = [...new Set(data.filter(c => c.reviewed_by).map(c => c.reviewed_by!))];

        const [profilesRes, reviewersRes] = await Promise.all([
          supabase.from('profiles').select('id, display_name, avatar_url, app_uid, gender').in('id', userIds),
          reviewerIds.length > 0
            ? supabase.from('admin_users').select('user_id, display_name, email').in('user_id', reviewerIds)
            : Promise.resolve({ data: [] }),
        ]);

        const profileMap: Record<string, any> = {};
        (profilesRes.data || []).forEach(p => { profileMap[p.id] = p; });

        const reviewerMap: Record<string, any> = {};
        (reviewersRes.data || []).forEach(r => { reviewerMap[r.user_id] = r; });

        const enriched = await Promise.all(data.map(async (c) => ({
          ...c,
          profile: profileMap[c.user_id] || null,
          reviewer: c.reviewed_by ? reviewerMap[c.reviewed_by] || null : null,
          screenshot_signed: await resolveAdminStorageImageUrl(c.screenshot_url, 'rating-screenshots'),
        })));
        setClaims(enriched);
      } else {
        setClaims([]);
      }
    } catch (err) {
      console.error('Fetch claims error:', err);
      recordAdminError({ kind: "rpc", label: "AdminRatingRewards.enriched", message: formatAdminError(err) });
      toast.error('Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchTransactionHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('rating_reward_claims')
        .select('*')
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(c => c.user_id))];
        const reviewerIds = [...new Set(data.filter(c => c.reviewed_by).map(c => c.reviewed_by!))];

        const [profilesRes, reviewersRes] = await Promise.all([
          supabase.from('profiles').select('id, display_name, avatar_url, app_uid, gender').in('id', userIds),
          reviewerIds.length > 0
            ? supabase.from('admin_users').select('user_id, display_name, email').in('user_id', reviewerIds)
            : Promise.resolve({ data: [] }),
        ]);

        const profileMap: Record<string, any> = {};
        (profilesRes.data || []).forEach(p => { profileMap[p.id] = p; });

        const reviewerMap: Record<string, any> = {};
        (reviewersRes.data || []).forEach(r => { reviewerMap[r.user_id] = r; });

        setHistoryData(await Promise.all(data.map(async (c) => ({
          ...c,
          profile: profileMap[c.user_id] || null,
          reviewer: c.reviewed_by ? reviewerMap[c.reviewed_by] || null : null,
          screenshot_signed: await resolveAdminStorageImageUrl(c.screenshot_url, 'rating-screenshots'),
        }))));
      } else {
        setHistoryData([]);
      }
    } catch (err) {
      console.error('Fetch transaction history error:', err);
      recordAdminError({ kind: "rpc", label: "AdminRatingRewards.reviewerMap", message: formatAdminError(err) });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (filter === 'history') {
      fetchTransactionHistory();
    } else {
      fetchClaims();
    }
  }, [filter, fetchClaims, fetchTransactionHistory]);

  useAdminRealtime(['rating_reward_claims'], () => {
    if (filter === 'history') fetchTransactionHistory();
    else fetchClaims();
  }, 'admin-rating-rewards');

  const handleApprove = async (claim: RatingClaim) => {
    setProcessingId(claim.id);
    try {
      const session = getAdminSession();
      if (!session?.admin_id) throw new Error('Admin session expired. Please log in again.');

      setClaims(prev => prev.filter(c => c.id !== claim.id));

      const { data, error } = await supabase.rpc('approve_rating_reward', {
        p_claim_id: claim.id,
        p_admin_id: session.admin_id,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || 'Failed to approve');
        fetchClaims();
        return;
      }

      const amt = Number(result?.reward_amount ?? 0).toLocaleString();
      const rewardLabel = result.reward_type === 'beans' ? `🫘 ${amt} Beans` : `💎 ${amt} Diamonds`;
      await adminSendNotification(claim.user_id, '🎉 Rating Reward Approved!', `Congratulations! Your Play Store rating has been verified. ${rewardLabel} have been credited to your account. Thank you for your support!`, 'system')

      toast.success(`Approved! ${rewardLabel} sent to user`);
    } catch (err: any) {
      console.error('Approve error:', err);
      recordAdminError({ kind: "rpc", label: "AdminRatingRewards.approve", message: formatAdminError(err) });
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (claimId: string) => {
    setProcessingId(claimId);
    try {
      const session = getAdminSession();
      if (!session?.admin_id) throw new Error('Admin session expired. Please log in again.');

      setClaims(prev => prev.filter(c => c.id !== claimId));

      const { error } = await supabase
        .from('rating_reward_claims')
        .update({
          status: 'rejected',
          reviewed_by: session.admin_id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: 'Screenshot does not show a valid 5-star rating',
        })
        .eq('id', claimId);

      if (error) throw error;

      const rejectedClaim = claims.find(c => c.id === claimId);
      if (rejectedClaim) {
        await adminSendNotification(rejectedClaim.user_id, '❌ Rating Reward Rejected', 'Your Play Store rating screenshot was not approved. Please make sure to submit a clear screenshot showing your 5-star rating. You can only submit once.', 'system');
      }

      toast.success('Claim rejected');
    } catch (err: any) {
      recordAdminError({ kind: "rpc", label: "AdminRatingRewards.reject", message: formatAdminError(err) });
      toast.error(err.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredClaims = claims.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.profile?.display_name?.toLowerCase().includes(q) ||
      c.profile?.app_uid?.toLowerCase().includes(q) ||
      c.user_id.toLowerCase().includes(q)
    );
  });

  const filteredHistory = historyData.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.profile?.display_name?.toLowerCase().includes(q) ||
      c.profile?.app_uid?.toLowerCase().includes(q) ||
      c.user_id.toLowerCase().includes(q)
    );
  });

  const pendingCount = claims.filter(c => c.status === 'pending').length;

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Stats for history
  const totalBeansSent = historyData.filter(c => c.status === 'approved' && c.reward_type === 'beans').reduce((s, c) => s + c.reward_amount, 0);
  const totalDiamondsSent = historyData.filter(c => c.status === 'approved' && c.reward_type === 'diamonds').reduce((s, c) => s + c.reward_amount, 0);
  const totalApproved = historyData.filter(c => c.status === 'approved').length;
  const totalRejected = historyData.filter(c => c.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-400" />
            Rating Reward Claims
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Review Play Store rating screenshots and approve rewards
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Rating Popup Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700">
            <Power className={`w-4 h-4 ${ratingEnabled ? 'text-emerald-400' : 'text-red-400'}`} />
            <span className="text-xs text-slate-300">Popup</span>
            <Switch
              checked={ratingEnabled}
              onCheckedChange={toggleRatingPopup}
              disabled={togglingRating}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
          {pendingCount > 0 && filter !== 'history' && (
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1">
              {pendingCount} Pending
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => filter === 'history' ? fetchTransactionHistory() : fetchClaims()} className="gap-1 border-slate-700">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="bg-slate-900/80 border border-slate-800">
            <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 gap-1">
              <Clock className="w-3.5 h-3.5" /> Pending
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 gap-1">
              <XCircle className="w-3.5 h-3.5" /> Rejected
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              All
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 gap-1">
              <History className="w-3.5 h-3.5" /> Transaction History
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-900/50 border-slate-800 text-white"
          />
        </div>
      </div>

      {/* Transaction History View */}
      {filter === 'history' ? (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-xs text-emerald-400 mb-1">Total Approved</div>
              <div className="text-2xl font-bold text-emerald-300">{totalApproved}</div>
            </div>
            <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/20">
              <div className="text-xs text-red-400 mb-1">Total Rejected</div>
              <div className="text-2xl font-bold text-red-300">{totalRejected}</div>
            </div>
            <div className="rounded-xl p-4 bg-amber-500/10 border border-amber-500/20">
              <div className="text-xs text-amber-400 mb-1">🫘 Beans Distributed</div>
              <div className="text-2xl font-bold text-amber-300">{totalBeansSent.toLocaleString()}</div>
            </div>
            <div className="rounded-xl p-4 bg-cyan-500/10 border border-cyan-500/20">
              <div className="text-xs text-cyan-400 mb-1">💎 Diamonds Distributed</div>
              <div className="text-2xl font-bold text-cyan-300">{totalDiamondsSent.toLocaleString()}</div>
            </div>
          </div>

          {/* Transaction Table */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-20">
              <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No transaction history found</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[40px_1fr_120px_140px_140px_100px] gap-3 px-4 py-3 bg-slate-900/80 text-[11px] text-slate-500 font-medium uppercase tracking-wider border-b border-slate-800">
                <div>#</div>
                <div>Recipient</div>
                <div>Reward</div>
                <div>Approved By</div>
                <div>Date</div>
                <div>Status</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-800/50">
                {filteredHistory.map((item, idx) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[40px_1fr_120px_140px_140px_100px] gap-3 px-4 py-3 items-center hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Index */}
                    <div className="text-xs text-slate-600 font-mono">{idx + 1}</div>

                    {/* Recipient */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="w-8 h-8 border border-slate-700 flex-shrink-0">
                        <AvatarImage src={item.profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-slate-800 text-slate-400 text-[10px]">
                          <User className="w-3.5 h-3.5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {item.profile?.display_name || 'Unknown'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.profile?.app_uid ? `#${item.profile.app_uid}` : item.user_id.slice(0, 8)}
                        </div>
                      </div>
                    </div>

                    {/* Reward */}
                    <div>
                      {item.status === 'approved' ? (
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${
                          item.reward_type === 'beans' ? 'text-amber-400' : 'text-cyan-400'
                        }`}>
                          <span>{item.reward_type === 'beans' ? '🫘' : '💎'}</span>
                          <span>{item.reward_amount.toLocaleString()}</span>
                          <span className="text-[10px] font-normal opacity-70">
                            {item.reward_type === 'beans' ? 'Beans' : 'Diamonds'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </div>

                    {/* Approved By */}
                    <div className="text-xs text-slate-400 truncate">
                      {item.reviewer?.display_name || item.reviewer?.email || (item.reviewed_by ? 'Admin' : '—')}
                    </div>

                    {/* Date */}
                    <div className="text-[11px] text-slate-500">
                      {item.reviewed_at ? formatFullDate(item.reviewed_at) : '—'}
                    </div>

                    {/* Status */}
                    <div>
                      <Badge className={`text-[10px] px-2 py-0.5 ${
                        item.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}>
                        {item.status === 'approved' ? '✅ Sent' : '❌ Rejected'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Claims List (Original) */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="text-center py-20">
              <Star className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No {filter !== 'all' ? filter : ''} claims found</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center gap-4 rounded-xl p-4 transition-all"
                  style={{
                    background: claim.status === 'pending'
                      ? 'rgba(251,191,36,0.06)'
                      : claim.status === 'approved'
                      ? 'rgba(16,185,129,0.06)'
                      : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${
                      claim.status === 'pending'
                        ? 'rgba(251,191,36,0.15)'
                        : claim.status === 'approved'
                        ? 'rgba(16,185,129,0.15)'
                        : 'rgba(239,68,68,0.15)'
                    }`,
                  }}
                >
                  <Avatar className="w-11 h-11 border-2 border-slate-700 flex-shrink-0">
                    <AvatarImage src={claim.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-slate-800 text-slate-400 text-sm">
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm truncate">
                        {claim.profile?.display_name || 'Unknown'}
                      </span>
                      {claim.profile?.app_uid && (
                        <span className="text-[10px] text-slate-500">#{claim.profile.app_uid}</span>
                      )}
                      <Badge className={`text-[10px] px-1.5 py-0 ${
                        claim.profile?.gender === 'female'
                          ? 'bg-pink-500/20 text-pink-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {claim.profile?.gender === 'female' ? '♀ Female' : '♂ Male'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-slate-500">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        {formatDate(claim.created_at)}
                      </span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${
                        claim.status === 'pending' ? 'bg-amber-500/20 text-amber-300'
                          : claim.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {claim.status === 'pending' ? '⏳ Pending' : claim.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                      </Badge>
                      {claim.status === 'approved' && (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {claim.reward_type === 'beans' ? '🫘 10,000 Beans' : '💎 5,000 Diamonds'}
                        </span>
                      )}
                      {(claim.status === 'approved' || claim.status === 'rejected') && claim.reviewer && (
                        <span className="text-[10px] text-slate-500">
                          by {claim.reviewer.display_name || claim.reviewer.email || 'Admin'}
                        </span>
                      )}
                      {(claim.status === 'approved' || claim.status === 'rejected') && claim.reviewed_at && (
                        <span className="text-[10px] text-slate-600">
                          • {formatDate(claim.reviewed_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setPreviewImage(claim.screenshot_signed || claim.screenshot_url)}
                    className="w-14 h-14 rounded-lg overflow-hidden border border-slate-700 hover:border-purple-500 transition-colors flex-shrink-0 relative group"
                  >
                    <img src={claim.screenshot_signed || claim.screenshot_url} alt="Screenshot" className="w-full h-full object-cover" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                  </button>

                  {claim.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(claim)}
                        disabled={processingId === claim.id}
                        className="h-9 px-3 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(claim.id)}
                        disabled={processingId === claim.id}
                        className="h-9 px-3 gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-2 bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">Rating Screenshot</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <img src={previewImage} alt="Rating Screenshot" className="w-full rounded-lg" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
