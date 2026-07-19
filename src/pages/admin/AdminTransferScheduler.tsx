import React, { useState, useEffect, useCallback } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Play, Pause, RefreshCw, Calendar, Timer, Zap, CheckCircle, ChevronDown, ChevronUp, Building2, User, Gem } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from 'sonner';
import { loadAppSetting, parseSettingValue, saveAppSetting } from '@/utils/adminSettingsStorage';
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface TransferSchedule {
  is_active: boolean;
  schedule_day_of_week: number; // 0=Sun..6=Sat
  schedule_hour: number; // 0-23
  schedule_minute: number; // 0-59
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

interface CommissionSchedule {
  is_active: boolean;
  delay_hours_after_transfer: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_result: { transfers_processed?: number; own_commission_total?: number; upper_bonus_total?: number } | null;
}

const AdminTransferScheduler = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [schedule, setSchedule] = useState<TransferSchedule>({
    is_active: false,
    schedule_day_of_week: 1, // Monday
    schedule_hour: 0,
    schedule_minute: 5,
    next_transfer_at: null,
    last_transfer_at: null,
    timezone: 'Asia/Dhaka'
  });
  const [commissionSchedule, setCommissionSchedule] = useState<CommissionSchedule>({
    is_active: true,
    delay_hours_after_transfer: 1,
    next_run_at: null,
    last_run_at: null,
    last_result: null,
  });
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [history, setHistory] = useState<TransferHistory[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, BatchDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedule();
    fetchCommissionSchedule();
    fetchHistory();
  }, []);

  useAdminRealtime(['agency_earnings_transfers'], () => { fetchSchedule(); fetchHistory(); });

  // Countdown display (visual only — server fires the actual transfer)
  useEffect(() => {
    if (!schedule.next_transfer_at || !schedule.is_active) return;
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(schedule.next_transfer_at!).getTime();
      const diff = target - now;
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
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

  // Note: server-side pg_cron ticks (tick_agency_weekly_scheduler /
  // tick_agency_commission_scheduler) run every minute and fire the actual
  // transfer + commission based on app_settings. The browser no longer fires.


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
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingSchedule", message: formatAdminError(error)});
    } finally {
      setLoading(false);
    }
  };

  const fetchCommissionSchedule = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'commission_schedule')
        .maybeSingle();
      if (data?.setting_value) {
        const value = parseSettingValue<CommissionSchedule>(data.setting_value) as CommissionSchedule;
        setCommissionSchedule({
          is_active: value.is_active ?? true,
          delay_hours_after_transfer: value.delay_hours_after_transfer ?? 1,
          next_run_at: value.next_run_at ?? null,
          last_run_at: value.last_run_at ?? null,
          last_result: value.last_result ?? null,
        });
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingCommissionSchedule", message: formatAdminError(error)});
    }
  };

  const saveCommissionSchedule = async (next: CommissionSchedule) => {
    try {
      await saveAppSetting('commission_schedule', JSON.parse(JSON.stringify(next)), 'Agency commission distribution schedule');
      setCommissionSchedule(next);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorSavingCommissionSchedule", message: formatAdminError(error)});
      toast.error('Failed to save commission schedule');
    }
  };

  const distributeCommissionNow = async () => {
    setDistributing(true);
    try {
      const { data, error } = await supabase.functions.invoke('agency-commission-distribute', {
        body: { manual: true },
      });
      if (error) throw error;
      const result = data?.result || {};
      await saveCommissionSchedule({
        ...commissionSchedule,
        last_run_at: new Date().toISOString(),
        next_run_at: null,
        last_result: result,
      });
      toast.success(
        `Commission distributed: ${result.transfers_processed ?? 0} transfers, ${formatNumber(result.own_commission_total ?? 0)} agency + ${formatNumber(result.upper_bonus_total ?? 0)} upper bonus`
      );
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorDistributingCommission", message: formatAdminError(error)});
      toast.error('Commission distribution failed');
    } finally {
      setDistributing(false);
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
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingHistory", message: formatAdminError(error)});
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
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorFetchingBatchDetails", message: formatAdminError(error)});
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

  // Merge-safe save: NEVER overwrite server-managed fields (last_transfer_at,
  // last_scheduled_at, last_result). Re-fetch latest config and only persist
  // the admin-editable knobs + a freshly-computed next_transfer_at.
  const saveSchedule = async (newSchedule: TransferSchedule) => {
    setSaving(true);
    try {
      const latest = await loadAppSetting<Partial<TransferSchedule>>('transfer_schedule');
      const base: Record<string, unknown> = latest && typeof latest === 'object' ? { ...latest } : {};

      const editable = {
        is_active: newSchedule.is_active,
        schedule_day_of_week: newSchedule.schedule_day_of_week,
        schedule_hour: newSchedule.schedule_hour,
        schedule_minute: newSchedule.schedule_minute,
        timezone: newSchedule.timezone,
      };

      // Always recompute next_transfer_at from the (potentially updated) knobs.
      const merged = { ...base, ...editable } as TransferSchedule;
      const nextRun = editable.is_active ? computeNextRun(merged).toISOString() : null;

      const payload = { ...merged, next_transfer_at: nextRun };
      await saveAppSetting('transfer_schedule', JSON.parse(JSON.stringify(payload)), 'Weekly transfer schedule settings');

      setSchedule(payload);
      toast.success('Settings saved');
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorSavingSchedule", message: formatAdminError(error)});
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Compute next fire time (wall-clock) for the configured weekday+hour+minute in tz
  const computeNextRun = (s: TransferSchedule): Date => {
    const tz = s.timezone || 'UTC';
    const nowUtcMs = Date.now();
    for (let i = 0; i < 8 * 24 * 60; i++) {
      const cand = new Date(nowUtcMs + i * 60 * 1000);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(cand);
      const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(p => p.type==='weekday')?.value || '');
      const hh = parseInt(parts.find(p => p.type==='hour')?.value || '0', 10);
      const mm = parseInt(parts.find(p => p.type==='minute')?.value || '0', 10);
      if (wd === s.schedule_day_of_week && hh === s.schedule_hour && mm === s.schedule_minute) return cand;
    }
    return new Date(nowUtcMs + 7 * 24 * 60 * 60 * 1000);
  };

  const startTimer = async () => {
    await saveSchedule({ ...schedule, is_active: true });
    toast.success('Schedule activated! Server will fire automatically.');
  };


  const stopTimer = async () => {
    await saveSchedule({ ...schedule, is_active: false });
    toast.success('Timer stopped');
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

      // Auto-schedule the agency commission distribution after the configured delay
      if (commissionSchedule.is_active) {
        const delayMs = (commissionSchedule.delay_hours_after_transfer || 1) * 60 * 60 * 1000;
        const nextRun = new Date(Date.now() + delayMs).toISOString();
        await saveCommissionSchedule({ ...commissionSchedule, next_run_at: nextRun });
      }

      toast.success(`Transfer complete! ${data?.result?.total_transfers || 0} transfers processed`);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminTransferScheduler.ErrorProcessingTransfer", message: formatAdminError(error)});
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
    <div className="admin-pro-shell">
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

        {/* Settings Card — Weekday + Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-5 h-5 text-primary" />
              Weekly Transfer Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Pick the weekday and exact time. The transfer runs automatically every week at that wall-clock time
              — even when no admin is logged in.
            </p>

            <div className="space-y-2">
              <Label>Day of the week</Label>
              <Select
                value={String(schedule.schedule_day_of_week)}
                onValueChange={(v) => setSchedule({ ...schedule, schedule_day_of_week: parseInt(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hour (0-23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={schedule.schedule_hour}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(23, parseInt(e.target.value || '0', 10) || 0));
                    setSchedule({ ...schedule, schedule_hour: n });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Minute (0-59)</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={schedule.schedule_minute}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10) || 0));
                    setSchedule({ ...schedule, schedule_minute: n });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={schedule.timezone}
                onValueChange={(v) => setSchedule({ ...schedule, timezone: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Dhaka">Bangladesh (UTC+6)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Asia/Kolkata">India (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Karachi">Pakistan (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Dubai">UAE (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={() => saveSchedule(schedule)}

              disabled={saving}
            >
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Save Schedule
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

        {/* Agency Commission Distribution */}
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gem className="w-5 h-5 text-purple-500" />
              Agency Commission Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Pays each agency its level commission on weekly host beans transferred. Upper agency receives the
              (upper rate − sub rate) difference only when strictly greater. Company-paid — never deducted from
              host or sub-agency.
            </p>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label className="text-sm">Auto-run after host transfer</Label>
                <p className="text-xs text-muted-foreground">Runs automatically once delay elapses</p>
              </div>
              <Switch
                checked={commissionSchedule.is_active}
                onCheckedChange={(v) => saveCommissionSchedule({ ...commissionSchedule, is_active: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Delay after host transfer (hours)</Label>
              <Select
                value={String(commissionSchedule.delay_hours_after_transfer)}
                onValueChange={(v) => saveCommissionSchedule({ ...commissionSchedule, delay_hours_after_transfer: parseInt(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 6, 12, 24].map(h => (
                    <SelectItem key={h} value={String(h)}>{h} hour{h > 1 ? 's' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-muted-foreground">Last run</div>
                <div className="font-medium">{commissionSchedule.last_run_at ? formatDate(commissionSchedule.last_run_at) : '—'}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="text-muted-foreground">Next auto run</div>
                <div className="font-medium">{commissionSchedule.next_run_at ? formatDate(commissionSchedule.next_run_at) : '—'}</div>
              </div>
            </div>

            {commissionSchedule.last_result && (
              <div className="rounded-md border border-border p-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Transfers processed</span><span className="font-medium">{commissionSchedule.last_result.transfers_processed ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Agency commission</span><span className="font-medium text-green-500">{formatNumber(commissionSchedule.last_result.own_commission_total ?? 0)} Beans</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Upper referral bonus</span><span className="font-medium text-purple-500">{formatNumber(commissionSchedule.last_result.upper_bonus_total ?? 0)} Beans</span></div>
              </div>
            )}

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={distributeCommissionNow}
              disabled={distributing}
            >
              {distributing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Gem className="w-4 h-4 mr-2" />}
              Distribute Commission Now
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/admin/agency-commission-log')}
            >
              View Commission Log & Adjust
            </Button>
          </CardContent>
        </Card>

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
