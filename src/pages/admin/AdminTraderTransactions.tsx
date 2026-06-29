import ReportExportMenu from "@/components/admin/ReportExportMenu";
import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, TrendingUp, ArrowUpRight, ArrowDownLeft, 
  Search, RefreshCw, Filter, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface Transaction {
  id: string;
  helper_id: string;
  user_id: string | null;
  transaction_type: string;
  coin_amount: number;
  usd_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  helper?: { 
    user: { display_name: string; avatar_url: string; app_uid: string } 
  };
  user?: { display_name: string; avatar_url: string; app_uid: string };
}

const AdminTraderTransactions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stats, setStats] = useState({
    totalBought: 0,
    totalSold: 0,
    totalTransferred: 0,
    pendingValue: 0
  });

  useAdminRealtime(['helper_transactions'], () => fetchTransactions());

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('helper_transactions')
        .select(`
          *,
          helper:topup_helpers!helper_transactions_helper_id_fkey(
            user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
          ),
          user:profiles!helper_transactions_user_id_fkey(display_name, avatar_url, app_uid)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setTransactions(data || []);

      // Calculate stats
      const completedTxns = (data || []).filter(t => t.status === 'completed');
      setStats({
        totalBought: completedTxns.filter(t => t.transaction_type === 'buy_from_platform').reduce((s, t) => s + t.coin_amount, 0),
        totalSold: completedTxns.filter(t => t.transaction_type === 'sell_to_user').reduce((s, t) => s + t.coin_amount, 0),
        totalTransferred: completedTxns.filter(t => t.transaction_type === 'transfer_to_user').reduce((s, t) => s + t.coin_amount, 0),
        pendingValue: (data || []).filter(t => t.status === 'pending').reduce((s, t) => s + t.usd_amount, 0)
      });
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTraderTransactions", message: formatAdminError(error) });
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch(type) {
      case 'buy_from_platform': return <ArrowDownLeft className="w-4 h-4 text-green-500" />;
      case 'sell_to_user': return <ArrowUpRight className="w-4 h-4 text-blue-500" />;
      case 'transfer_to_user': return <ArrowUpRight className="w-4 h-4 text-purple-500" />;
      default: return <TrendingUp className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch(type) {
      case 'buy_from_platform': return 'Bought from Platform';
      case 'sell_to_user': return 'Sold to User';
      case 'transfer_to_user': return 'Transferred to User';
      case 'withdraw': return 'Withdrawal';
      default: return type;
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = !searchQuery || 
      txn.helper?.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || txn.transaction_type === typeFilter;
    const matchesStatus = statusFilter === 'all' || txn.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="admin-pro-shell">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-red-500 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-white/20" onClick={() => navigate('/admin/coin-traders')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-slate-900">Trader Transactions</h1>
            <p className="text-slate-700 text-sm">All Diamond transactions</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ReportExportMenu
              rows={transactions as any}
              columns={[
                { key: "created_at", label: "Date", weight: 1.2, format: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
                { key: "transaction_type", label: "Type", weight: 1.1 },
                { key: "user_id", label: "User", weight: 1.2, format: (_, r: any) => r.user?.display_name || r.user_id || "—" },
                { key: "helper_id", label: "Helper", weight: 1.2, format: (_, r: any) => (r.helper as any)?.user?.display_name || r.helper_id || "—" },
                { key: "coin_amount", label: "Diamonds", weight: 1, format: (v) => v != null ? Number(v).toLocaleString() : "—" },
                { key: "usd_amount", label: "USD", weight: 0.9, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "status", label: "Status", weight: 0.9 },
              ]}
              meta={{
                title: "Trader Transactions Report",
                subtitle: `${transactions.length} transactions`,
                fileName: "trader-transactions",
                summary: [
                  { label: "Bought", value: stats.totalBought.toLocaleString() },
                  { label: "Sold", value: stats.totalSold.toLocaleString() },
                  { label: "Transferred", value: stats.totalTransferred.toLocaleString() },
                  { label: "Pending $", value: `$${stats.pendingValue.toFixed(0)}` },
                ],
              }}
            />
            <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-white/20" onClick={fetchTransactions}>
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-200">{(stats.totalBought / 1000).toFixed(0)}K</p>
            <p className="text-slate-700 text-xs">Bought</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-200">{(stats.totalSold / 1000).toFixed(0)}K</p>
            <p className="text-slate-700 text-xs">Sold</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-purple-200">{(stats.totalTransferred / 1000).toFixed(0)}K</p>
            <p className="text-slate-700 text-xs">Transferred</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-200">${stats.pendingValue.toFixed(0)}</p>
            <p className="text-slate-700 text-xs">Pending</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl shadow-md p-4">
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search helper or user..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="pl-10" 
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="buy_from_platform">Bought from Platform</SelectItem>
                <SelectItem value="sell_to_user">Sold to User</SelectItem>
                <SelectItem value="transfer_to_user">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="px-4 mt-4 pb-20">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Helper</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map(txn => (
                      <TableRow key={txn.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <UserAvatarImage seed={(((txn.helper?.user) as any)?.id ?? ((txn.helper?.user) as any)?.user_id ?? ((txn.helper?.user) as any)?.host_id)} gender={((txn.helper?.user) as any)?.gender} src={txn.helper?.user?.avatar_url} />
                              <AvatarFallback>{txn.helper?.user?.display_name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{txn.helper?.user?.display_name}</p>
                              <p className="text-xs text-slate-500">{txn.helper?.user?.app_uid}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(txn.transaction_type)}
                            <span className="text-sm">{getTransactionLabel(txn.transaction_type)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-bold text-emerald-600">{txn.coin_amount.toLocaleString()} 💎</p>
                            <p className="text-xs text-slate-500">${txn.usd_amount.toFixed(2)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {txn.user ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="w-6 h-6">
                                <UserAvatarImage seed={(((txn.user) as any)?.id ?? ((txn.user) as any)?.user_id ?? ((txn.user) as any)?.host_id)} gender={((txn.user) as any)?.gender} src={txn.user.avatar_url} />
                                <AvatarFallback>{txn.user.display_name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{txn.user.display_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${
                            txn.status === 'completed' ? 'bg-green-100 text-green-700' :
                            txn.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {txn.status === 'completed' ? 'Completed' : 
                             txn.status === 'pending' ? 'Pending' : 'Failed'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{format(new Date(txn.created_at), 'dd/MM/yy')}</p>
                          <p className="text-xs text-slate-500">{format(new Date(txn.created_at), 'hh:mm a')}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminTraderTransactions;