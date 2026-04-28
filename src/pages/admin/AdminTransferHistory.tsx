import React, { useState, useEffect } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, RefreshCw, Search, Download, Filter, 
  Building2, User, Gift, Phone, Calendar, Clock,
  TrendingUp, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from 'sonner';

interface TransferRecord {
  id: string;
  agency_id: string;
  host_id: string;
  amount: number;
  gift_earnings: number;
  call_earnings: number;
  host_uid: string;
  host_name: string;
  agency_name: string;
  commission_rate: number;
  transfer_type: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  processed_at: string;
  notes: string;
  // Joined data
  agency?: {
    name: string;
    agency_code: string;
  } | null;
  host?: {
    display_name: string;
    app_uid: string;
    avatar_url: string;
  } | null;
}

interface Stats {
  totalTransfers: number;
  totalAmount: number;
  totalGiftEarnings: number;
  totalCallEarnings: number;
  uniqueHosts: number;
  uniqueAgencies: number;
}

const AdminTransferHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalTransfers: 0,
    totalAmount: 0,
    totalGiftEarnings: 0,
    totalCallEarnings: 0,
    uniqueHosts: 0,
    uniqueAgencies: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgency, setSelectedAgency] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [agencies, setAgencies] = useState<{id: string; name: string}[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferRecord | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Initial load
  useEffect(() => {
    fetchAgencies();
  }, []);
  
  // Fetch transfers when filters change
  useEffect(() => {
    fetchTransfers();
  }, [selectedAgency, dateFilter, sortField, sortOrder]);

  useAdminRealtime(['agency_earnings_transfers', 'agencies'], () => { fetchTransfers(, { enableRealtimeRefresh: true }); fetchAgencies(); });

  const fetchAgencies = async () => {
    const { data } = await supabase
      .from('agencies')
      .select('id, name')
      .order('name');
    if (data) setAgencies(data);
  };

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('agency_earnings_transfers')
        .select(`
          *,
          agency:agencies(name, agency_code),
          host:profiles!agency_earnings_transfers_host_id_fkey(display_name, app_uid, avatar_url)
        `)
        .order(sortField, { ascending: sortOrder === 'asc' });

      if (selectedAgency !== 'all') {
        query = query.eq('agency_id', selectedAgency);
      }

      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch(dateFilter) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          default:
            startDate = new Date(0);
        }
        
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const transferData = (data || []) as unknown as TransferRecord[];
      setTransfers(transferData);

      // Calculate stats
      const hostIds = new Set(transferData.map(t => t.host_id));
      const agencyIds = new Set(transferData.map(t => t.agency_id));
      
      setStats({
        totalTransfers: transferData.length,
        totalAmount: transferData.reduce((sum, t) => sum + (t.amount || 0), 0),
        totalGiftEarnings: transferData.reduce((sum, t) => sum + (t.gift_earnings || 0), 0),
        totalCallEarnings: transferData.reduce((sum, t) => sum + (t.call_earnings || 0), 0),
        uniqueHosts: hostIds.size,
        uniqueAgencies: agencyIds.size
      });

    } catch (error) {
      console.error('Error fetching transfers:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransfers = transfers.filter(t => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (t.host_name?.toLowerCase().includes(query)) ||
      (t.host_uid?.toLowerCase().includes(query)) ||
      (t.agency_name?.toLowerCase().includes(query)) ||
      (t.host?.display_name?.toLowerCase().includes(query)) ||
      (t.host?.app_uid?.toLowerCase().includes(query)) ||
      (t.agency?.name?.toLowerCase().includes(query))
    );
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toLocaleString();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-4 h-4 inline ml-1" /> : 
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Host Name', 'Host UID', 'Agency', 'Gift Earnings', 'Call Earnings', 'Total', 'Commission %', 'Status'];
    const rows = filteredTransfers.map(t => [
      formatDate(t.created_at),
      t.host_name || t.host?.display_name || '-',
      t.host_uid || t.host?.app_uid || '-',
      t.agency_name || t.agency?.name || '-',
      t.gift_earnings || 0,
      t.call_earnings || 0,
      t.amount || 0,
      t.commission_rate || 0,
      t.status
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transfer-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success('CSV downloaded');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold">Transfer History</h1>
              <p className="text-xs text-muted-foreground">All Host → Agency Transfers</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="w-4 h-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="icon" onClick={fetchTransfers}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Transfers</div>
              <div className="text-xl font-bold text-blue-500">{stats.totalTransfers}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Amount</div>
              <div className="text-xl font-bold text-green-500">{formatNumber(stats.totalAmount)}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gift className="w-3 h-3" /> Gift Earnings
              </div>
              <div className="text-xl font-bold text-pink-500">{formatNumber(stats.totalGiftEarnings)}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" /> Call Earnings
              </div>
              <div className="text-xl font-bold text-purple-500">{formatNumber(stats.totalCallEarnings)}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="w-3 h-3" /> Hosts
              </div>
              <div className="text-xl font-bold text-amber-500">{stats.uniqueHosts}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="w-3 h-3" /> Agencies
              </div>
              <div className="text-xl font-bold text-cyan-500">{stats.uniqueAgencies}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search Host, UID, Agency..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={selectedAgency} onValueChange={setSelectedAgency}>
                <SelectTrigger className="w-[180px]">
                  <Building2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  {agencies.map(agency => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[150px]">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transfer Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Transfer Records ({filteredTransfers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredTransfers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transfer records found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:text-primary"
                        onClick={() => handleSort('created_at')}
                      >
                        Date <SortIcon field="created_at" />
                      </TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Agency</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-primary text-right"
                        onClick={() => handleSort('gift_earnings')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Gift className="w-3 h-3" /> Gift <SortIcon field="gift_earnings" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-primary text-right"
                        onClick={() => handleSort('call_earnings')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Phone className="w-3 h-3" /> Call <SortIcon field="call_earnings" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-primary text-right"
                        onClick={() => handleSort('amount')}
                      >
                        Transfer <SortIcon field="amount" />
                      </TableHead>
                      <TableHead className="text-center">Commission</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.map((transfer) => (
                      <TableRow key={transfer.id} className="hover:bg-muted/50">
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1 text-xs">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {formatDate(transfer.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">
                              {transfer.host_name || transfer.host?.display_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              UID: {transfer.host_uid || transfer.host?.app_uid || '-'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">
                              {transfer.agency_name || transfer.agency?.name || 'Unknown'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-pink-500 font-medium">
                            {formatNumber(transfer.gift_earnings || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-purple-500 font-medium">
                            {formatNumber(transfer.call_earnings || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-500 font-bold">
                            {formatNumber(transfer.amount || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">
                            {transfer.commission_rate || 0}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            className={
                              transfer.status === 'completed' 
                                ? 'bg-green-500/10 text-green-500' 
                                : transfer.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-red-500/10 text-red-500'
                            }
                          >
                            {transfer.status === 'completed' ? '✓ Completed' : 
                             transfer.status === 'pending' ? 'Pending' : 'Failed'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedTransfer(transfer);
                              setShowDetails(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Transfer Details
            </DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <div className="space-y-4">
              {/* Host Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-medium">Host Info</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-2 font-medium">
                      {selectedTransfer.host_name || selectedTransfer.host?.display_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">UID:</span>
                    <span className="ml-2 font-mono text-xs">
                      {selectedTransfer.host_uid || selectedTransfer.host?.app_uid}
                    </span>
                  </div>
                </div>
              </div>

              {/* Agency Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="font-medium">Agency Info</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="ml-2 font-medium">
                    {selectedTransfer.agency_name || selectedTransfer.agency?.name}
                  </span>
                </div>
              </div>

              {/* Earnings Breakdown */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="font-medium">Earnings Breakdown</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-pink-500" />
                      <span>Gift Earnings</span>
                    </div>
                    <span className="font-bold text-pink-500">
                      {formatNumber(selectedTransfer.gift_earnings || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-purple-500" />
                      <span>Call Earnings</span>
                    </div>
                    <span className="font-bold text-purple-500">
                      {formatNumber(selectedTransfer.call_earnings || 0)}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex justify-between items-center">
                    <span className="font-medium">Total Host Earnings</span>
                    <span className="font-bold">
                      {formatNumber((selectedTransfer.gift_earnings || 0) + (selectedTransfer.call_earnings || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Commission Rate</span>
                    <span>{selectedTransfer.commission_rate || 0}%</span>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-2 flex justify-between items-center">
                    <span className="font-medium text-green-500">Transferred to Agency</span>
                    <span className="font-bold text-lg text-green-500">
                      {formatNumber(selectedTransfer.amount || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Time Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-medium">Period</span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start:</span>
                    <span>{formatDate(selectedTransfer.period_start)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End:</span>
                    <span>{formatDate(selectedTransfer.period_end)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed:</span>
                    <span>{formatDate(selectedTransfer.processed_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTransferHistory;
