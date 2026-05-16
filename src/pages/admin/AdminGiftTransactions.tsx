import { useState, useEffect, useCallback } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";

import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, RefreshCw, Search, TrendingUp, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface GiftTransaction {
  id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  coin_amount: number;
  created_at: string;
  stream_id: string | null;
  party_room_id: string | null;
  reel_id: string | null;
  sender?: { display_name: string; avatar_url: string; app_uid: string };
  receiver?: { display_name: string; avatar_url: string; app_uid: string };
  gift?: { name: string; icon_url: string };
}

interface ReceiverSummary {
  receiver_id: string;
  display_name: string;
  avatar_url: string;
  app_uid: string;
  total_beans: number;
  gift_count: number;
}

const PAGE_SIZE = 50;


export default function AdminGiftTransactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<GiftTransaction[]>(() => getAdminCache<GiftTransaction[]>('admin_gift_txns') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_gift_txns'));
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("receivers");
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [uniqueSenders, setUniqueSenders] = useState(0);
  const [uniqueReceivers, setUniqueReceivers] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else if (transactions.length === 0) setLoading(true);
    try {
      const tzOffset = Math.round(new Date().getTimezoneOffset() / -60);
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-chat-inspector/gift-transactions?tzOffset=${tzOffset}&page=${pageNum}&pageSize=${PAGE_SIZE}`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed');

      const txns = data?.transactions || [];
      setTransactions(prev => {
        if (!append) return txns;
        const seen = new Set(prev.map(t => t.id));
        return [...prev, ...txns.filter((t: GiftTransaction) => !seen.has(t.id))];
      });

      const stats = data?.stats || {};
      setTodayTotal(stats.total_beans || 0);
      setTodayCount(stats.total_count || 0);
      setUniqueSenders(stats.unique_senders || 0);
      setUniqueReceivers(stats.unique_receivers || 0);
      setHasMore(!!data?.hasMore);
      setPage(pageNum);
      setLastRefresh(new Date());
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminGiftTransactions.ErrorFetchingGiftTransactions", message: formatAdminError(error)});
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const fetchTransactions = useCallback(() => fetchPage(1, false), [fetchPage]);
  const loadMore = useCallback(() => fetchPage(page + 1, true), [fetchPage, page]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  // Auto-refresh disabled per admin policy. Use the manual refresh button instead.

  // Aggregate by receiver
  const receiverSummaries: ReceiverSummary[] = (() => {
    const map = new Map<string, ReceiverSummary>();
    transactions.forEach(t => {
      const existing = map.get(t.receiver_id);
      if (existing) {
        existing.total_beans += t.coin_amount || 0;
        existing.gift_count += 1;
      } else {
        map.set(t.receiver_id, {
          receiver_id: t.receiver_id,
          display_name: t.receiver?.display_name || 'Unknown',
          avatar_url: t.receiver?.avatar_url || '',
          app_uid: t.receiver?.app_uid || '',
          total_beans: t.coin_amount || 0,
          gift_count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total_beans - a.total_beans);
  })();

  const filteredReceivers = receiverSummaries.filter(r =>
    !searchQuery ||
    r.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.app_uid?.includes(searchQuery)
  );

  const filteredTransactions = transactions.filter(t =>
    !searchQuery ||
    t.sender?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.receiver?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.sender?.app_uid?.includes(searchQuery) ||
    t.receiver?.app_uid?.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-[#0a0a14]">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-white">Today's Gift Activity</h1>
            <p className="text-white/80 text-sm">
              {lastRefresh ? `Updated ${format(lastRefresh, 'hh:mm:ss a')} • Tap refresh to update` : 'All gift transactions today'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 ml-auto" onClick={fetchTransactions}>
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">
              {todayTotal >= 1000000 ? `${(todayTotal / 1000000).toFixed(1)}M` : todayTotal.toLocaleString()}
            </p>
            <p className="text-white/80 text-xs">Total Beans</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-200">{todayCount}</p>
            <p className="text-white/80 text-xs">🎁 Gifts Sent</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-cyan-200">{uniqueSenders}</p>
            <p className="text-white/80 text-xs">👤 Senders</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-200">{uniqueReceivers}</p>
            <p className="text-white/80 text-xs">🌟 Receivers</p>
          </div>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="px-4 -mt-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full bg-white/5">
              <TabsTrigger value="receivers" className="flex-1 text-xs data-[state=active]:bg-fuchsia-600 data-[state=active]:text-white">
                🏆 Top Receivers ({uniqueReceivers})
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1 text-xs data-[state=active]:bg-fuchsia-600 data-[state=active]:text-white">
                📋 All Gifts ({todayCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 mt-4 pb-20">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-fuchsia-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : activeTab === 'receivers' ? (
          /* Receiver Rankings */
          <div className="space-y-3">
            {filteredReceivers.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-500">No gifts today</p>
              </div>
            ) : (
              filteredReceivers.map((receiver, index) => (
                <Card key={receiver.receiver_id} className="bg-white/5 border-white/10 overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-500 text-black' :
                        index === 1 ? 'bg-slate-300 text-black' :
                        index === 2 ? 'bg-amber-700 text-white' :
                        'bg-white/10 text-slate-400'
                      }`}>
                        {index + 1}
                      </div>
                      
                      <Avatar className="w-12 h-12 ring-2 ring-fuchsia-500/50">
                        <AvatarImage src={receiver.avatar_url} />
                        <AvatarFallback className="bg-fuchsia-500/20 text-fuchsia-300">
                          {receiver.display_name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{receiver.display_name}</p>
                        <p className="text-slate-400 text-xs">ID: {receiver.app_uid}</p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-emerald-400 font-bold text-lg">
                          {receiver.total_beans >= 100000 
                            ? `${(receiver.total_beans / 1000).toFixed(0)}K`
                            : receiver.total_beans.toLocaleString()} Beans
                        </p>
                        <p className="text-slate-400 text-xs">{receiver.gift_count} gifts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* All Transactions */
          <div className="space-y-2">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-500">No transactions found</p>
              </div>
            ) : (
              filteredTransactions.map(t => (
                <Card key={t.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      {/* Sender */}
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={t.sender?.avatar_url} />
                        <AvatarFallback className="text-xs bg-blue-500/20 text-blue-300">
                          {t.sender?.display_name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-white font-medium truncate max-w-[80px]">{t.sender?.display_name}</span>
                          <span className="text-slate-500">→</span>
                          <span className="text-fuchsia-300 font-medium truncate max-w-[80px]">{t.receiver?.display_name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.gift?.icon_url && !t.gift.icon_url.endsWith('.svga') && (
                            <img src={t.gift.icon_url} alt="" className="w-5 h-5 object-contain" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                          )}
                          {t.gift?.icon_url?.endsWith('.svga') && (
                            <span className="text-base">🎁</span>
                          )}
                          <span className="text-slate-400 text-[10px]">{t.gift?.name || 'Gift'}</span>
                          <span className="text-slate-600 text-[10px]">
                            {format(new Date(t.created_at), 'hh:mm a')}
                          </span>
                        </div>
                      </div>
                      
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                        {t.coin_amount?.toLocaleString()} Beans
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {hasMore && activeTab === 'all' && !searchQuery && (
              <Button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full mt-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
              >
                {loadingMore ? 'Loading...' : `Load More (${Math.max(0, todayCount - transactions.length)} remaining)`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
