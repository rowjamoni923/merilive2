import React, { useState, useEffect, useCallback } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Play, Pause, RefreshCw, Calendar, Timer, Zap, CheckCircle, ChevronDown, ChevronUp, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from 'sonner';
import { parseSettingValue, saveAppSetting } from '@/utils/adminSettingsStorage';
import { recordAdminError } from "@/utils/adminErrorLog";

interface TransferSchedule {
  is_active: boolean;
  interval_days: number;
  interval_hours: number;
  next_transfer_at: string | null;
  last_transfer_at: string | null;
  timezone: string;
}

interface TransferHistory {
  id: string;
  processed_at: string;
  total_transfers: number;
  total_amount: number;
  status: string;
}

interface BatchDetail {
  agency_id: string;
  agency_name: string | null;
  host_id: string;
  host_name: string | null;
  host_uid: string | null;
  amount: number;
}

const AdminTransferScheduler = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [schedule, setSchedule] = useState<TransferSchedule>({
    is_active: false,
    interval_days: 7,
    interval_hours: 0,
    next_transfer_at: null,
    last_transfer_at: null,
    timezone: 'Asia/Dhaka'
  });
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [history, setHistory] = useState<TransferHistory[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, BatchDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedule();
    fetchHistory();
  }, []);

  useAdminRealtime(['agency_earnings_transfers'], () => { fetchSchedule(); fetchHistory(); });

  useEffect(() => {
    if (!schedule.next_transfer_at || !schedule.is_active) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(schedule.next_transfer_at!).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        // Auto process when timer reaches 0
        handleAutoProcess();
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdown({ days, hours, minutes, seconds });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [schedule.next_transfer_at, schedule.is_active]);

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'transfer_schedule')
        .maybeSingle();

      if (data?.setting_value) {
        const value = parseSettingValue<TransferSchedule>(data.setting_value) as TransferSchedule;
        setSchedule(value);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingSchedule", message: error instanceof Error ? error.message : "Error fetching schedule" });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      // Fetch real transfer records from agency_earnings_transfers, grouped by batch
      const { data, error } = await supabase
        .from('agency_earnings_transfers')
        .select('id, amount, created_at, status, gift_earnings')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      if (data && data.length > 0) {
        // Group transfers by batch timestamp (same created_at = same batch)
        const batches = new Map<string, { count: number; total: number; status: string }>();
        for (const t of data) {
          // Round to minute to group batch transfers
          const batchKey = new Date(t.created_at).toISOString().slice(0, 16);
          const existing = batches.get(batchKey);
          if (existing) {
            existing.count++;
            existing.total += Number(t.amount) || 0;
          } else {
            batches.set(batchKey, {
              count: 1,
              total: Number(t.amount) || 0,
              status: t.status || 'completed'
            });
          }
        }

        const historyItems: TransferHistory[] = Array.from(batches.entries())
          .map(([key, val]) => ({
            id: key,
            processed_at: new Date(key).toISOString(),
            total_transfers: val.count,
            total_amount: val.total,
            status: val.status
          }))
          .slice(0, 20);

        setHistory(historyItems);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingHistory", message: error instanceof Error ? error.message : "Error fetching history" });
    }
  };

  const fetchBatchDetails = useCallback(async (batchKey: string) => {
    if (batchDetails[batchKey]) return; // Already loaded
    setLoadingDetails(batchKey);
    try {
      // batchKey is ISO string truncated to minute, fetch all transfers in that minute
      const startTime = new Date(batchKey + ':00.000Z');
      const endTime = new Date(startTime.getTime() + 60000);
      
      const { data, error } = await supabase
        .from('agency_earnings_transfers')
        .select('agency_id, agency_name, host_id, host_name, host_uid, amount')
        .gte('created_at', startTime.toISOString())
        .lt('created_at', endTime.toISOString())
        .order('amount', { ascending: false });

      if (error) throw error;
      setBatchDetails(prev => ({ ...prev, [batchKey]: data || [] }));
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingBatchDetails", message: error instanceof Error ? error.message : "Error fetching batch details" });
      toast.error('Failed to load details');
    } finally {
      setLoadingDetails(null);
    }
  }, [batchDetails]);

  const toggleBatch = (batchKey: string) => {
    if (expandedBatch === batchKey) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchKey);
      fetchBatchDetails(batchKey);
    }
  };

  // Group batch details by agency for display
  const groupByAgency = (details: BatchDetail[]) => {
    const grouped = new Map<string, { name: string; total: number; hosts: BatchDetail[] }>();
    for (const d of details) {
      const key = d.agency_id;
      const existing = grouped.get(key);
      if (existing) {
        existing.total += Number(d.amount) || 0;
        existing.hosts.push(d);
      } else {
        grouped.set(key, {
          name: d.agency_name || 'Unknown Agency',
          total: Number(d.amount) || 0,
          hosts: [d]
        });
      }
    }
    return Array.from(grouped.entries()).sort((a, b) => b[1].total - a[1].total);
  };

  const saveSchedule = async (newSchedule: TransferSchedule) => {
    setSaving(true);
    try {
      await saveAppSetting('transfer_schedule', JSON.parse(JSON.stringify(newSchedule)), 'Weekly transfer schedule settings');

      setSchedule(newSchedule);
      toast.success('Settings saved');
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorSavingSchedule", message: error instanceof Error ? error.message : "Error saving schedule" });
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const startTimer = async () => {
    const now = new Date();
    const nextTransfer = new Date(now.getTime() + (schedule.interval_days * 24 + schedule.interval_hours) * 60 * 60 * 1000);
    
    const newSchedule = {
      ...schedule,
      is_active: true,
      next_transfer_at: nextTransfer.toISOString()
    };
    
    await saveSchedule(newSchedule);
    toast.success('Timer started!');
  };

  const stopTimer = async () => {
    const newSchedule = {
      ...schedule,
      is_active: false,
      next_transfer_at: null
    };
    
    await saveSchedule(newSchedule);
    toast.success('Timer stopped');
  };

  const handleAutoProcess = async () => {
    await processTransferNow();
    // Restart timer for next cycle
    if (schedule.is_active) {
      await startTimer();
    }
  };

  const processTransferNow = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('agency-weekly-transfer', {
        body: { manual: true, timezone: schedule.timezone }
      });

      if (error) throw error;

      // Update last transfer time
      const newSchedule = {
        ...schedule,
        last_transfer_at: new Date().toISOString()
      };
      await saveSchedule(newSchedule);

      // Add to history
      const newHistory: TransferHistory = {
        id: crypto.randomUUID(),
        processed_at: new Date().toISOString(),
        total_transfers: data?.result?.total_transfers || 0,
        total_amount: data?.result?.total_amount || 0,
        status: 'completed'
      };

      const updatedHistory = [newHistory, ...history].slice(0, 10);
      
      // Refetch history from actual transfers table
      await fetchHistory();

      toast.success(`Transfer complete! ${data?.result?.total_transfers || 0} transfers processed`);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorProcessingTransfer", message: error instanceof Error ? error.message : "Error processing transfer" });
      toast.error('Transfer failed');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Transfer Scheduler</h1>
            <p className="text-xs text-muted-foreground">Auto transfer host beans</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Countdown Timer Card */}
        <Card className={`${schedule.is_active ? 'border-green-500/50 bg-green-500/5' : 'border-muted'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="w-5 h-5 text-primary" />
              Countdown Timer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedule.is_active && schedule.next_transfer_at ? (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">{countdown.days}</div>
                    <div className="text-xs text-muted-foreground">Days</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">{countdown.hours}</div>
                    <div className="text-xs text-muted-foreground">Hours</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">{countdown.minutes}</div>
                    <div className="text-xs text-muted-foreground">Minutes</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-primary">{countdown.seconds}</div>
                    <div className="text-xs text-muted-foreground">Seconds</div>
                  </div>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Next Transfer: {formatDate(schedule.next_transfer_at)}
                </div>
                <Button 
                  variant="destructive" 
                  className="w-full" 
                  onClick={stopTimer}
                  disabled={saving}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Timer
                </Button>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="text-muted-foreground">Timer is stopped</div>
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700" 
                  onClick={startTimer}
                  disabled={saving}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Timer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-5 h-5 text-primary" />
              Transfer Interval Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Days</Label>
                <Select 
                  value={schedule.interval_days.toString()} 
                  onValueChange={(v) => setSchedule({ ...schedule, interval_days: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 14, 30].map(d => (
                      <SelectItem key={d} value={d.toString()}>{d} Day(s)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Select 
                  value={schedule.interval_hours.toString()} 
                  onValueChange={(v) => setSchedule({ ...schedule, interval_hours: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6, 12, 18].map(h => (
                      <SelectItem key={h} value={h.toString()}>{h} Hour(s)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select 
                value={schedule.timezone} 
                onValueChange={(v) => setSchedule({ ...schedule, timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Dhaka">Bangladesh (UTC+6)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Asia/Kolkata">India (UTC+5:30)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full" 
              onClick={() => saveSchedule(schedule)}
              disabled={saving}
            >
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>
          </CardContent>
        </Card>

        {/* Manual Transfer Card */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="w-5 h-5 text-amber-500" />
              Manual Transfer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Transfer all host beans to agencies now (without timer)
            </p>
            <Button 
              variant="outline" 
              className="w-full border-amber-500 text-amber-500 hover:bg-amber-500/10"
              onClick={processTransferNow}
              disabled={processing}
            >
              {processing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Transfer Now
            </Button>
          </CardContent>
        </Card>

        {/* Last Transfer Info */}
        {schedule.last_transfer_at && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last Transfer:</span>
                <span className="text-sm font-medium">{formatDate(schedule.last_transfer_at)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transfer History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-5 h-5 text-primary" />
              Transfer History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <div className="space-y-2">
                {history.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border overflow-hidden">
                    <div 
                      onClick={() => toggleBatch(item.id)}
                      className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedBatch === item.id ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="text-sm font-medium">{formatDate(item.processed_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.total_transfers} transfers
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-green-500">
                          {formatNumber(item.total_amount)} Beans
                        </div>
                        <div className="text-xs text-green-500">{item.status}</div>
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {expandedBatch === item.id && (
                      <div className="border-t border-border bg-card p-3 space-y-2">
                        {loadingDetails === item.id ? (
                          <div className="flex items-center justify-center py-4">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary mr-2" />
                            <span className="text-sm text-muted-foreground">Loading...</span>
                          </div>
                        ) : batchDetails[item.id] ? (
                          groupByAgency(batchDetails[item.id]).map(([agencyId, agency]) => (
                            <div key={agencyId} className="rounded-md border border-border overflow-hidden">
                              <div className="flex items-center justify-between p-2 bg-primary/5">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-sm font-semibold text-foreground">{agency.name}</span>
                                </div>
                                <span className="text-sm font-bold text-primary">{formatNumber(agency.total)} Beans</span>
                              </div>
                              <div className="divide-y divide-border">
                                {agency.hosts.map((host, idx) => (
                                  <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-foreground">{host.host_name || 'Unknown'}</span>
                                      {host.host_uid && (
                                        <span className="text-muted-foreground">({host.host_uid})</span>
                                      )}
                                    </div>
                                    <span className="font-medium text-foreground">{formatNumber(Number(host.amount))} Beans</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-2">No data found</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No transfer records</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminTransferScheduler;
