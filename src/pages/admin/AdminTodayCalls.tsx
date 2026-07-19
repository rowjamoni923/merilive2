import { useState } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Search, RefreshCw, Clock, Gem, EyeOff, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { recordAdminError } from "@/utils/adminErrorLog";
import AdminRoomMonitor from "@/components/admin/AdminRoomMonitor";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
import { CopyableUid } from "@/components/admin/CopyableUid";
interface CallRecord {
  id: string;
  caller_id: string;
  host_id: string;
  status: string;
  duration_seconds: number | null;
  diamonds_spent: number | null;
  total_diamonds_deducted: number | null;
  host_earned: number | null;
  host_earnings_amount: number | null;
  host_earnings_credited: boolean | null;
  host_earnings_credited_at: string | null;
  diamonds_per_minute: number | null;
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  e2ee_key: string | null;
  caller_profile?: { display_name: string | null; avatar_url: string | null; app_uid: string | null } | null;
  host_profile?: { display_name: string | null; avatar_url: string | null; app_uid: string | null } | null;
}

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "ended":
    case "completed":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "active":
    case "connected":
      return "bg-blue-50 text-blue-600 border-blue-200/60";
    case "missed":
    case "timeout":
      return "bg-amber-50 text-amber-600 border-amber-200/60";
    case "rejected":
    case "cancelled":
      return "bg-red-50 text-red-600 border-red-200/60";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
};

const getSpentAmount = (call: CallRecord) => Number(call.total_diamonds_deducted ?? call.diamonds_spent ?? 0);
const getEarnedAmount = (call: CallRecord) => Number(call.host_earnings_amount ?? call.host_earned ?? 0);
const isSettledCall = (call: CallRecord) => call.status === "ended" || call.status === "completed";

export default function AdminTodayCalls() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [monitorCall, setMonitorCall] = useState<CallRecord | null>(null);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("private_calls")
        .select(`
          id, caller_id, host_id, status, duration_seconds, diamonds_spent,
          total_diamonds_deducted, host_earned, host_earnings_amount, host_earnings_credited,
          host_earnings_credited_at, diamonds_per_minute, created_at,
          connected_at, ended_at, end_reason, e2ee_key
        `)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const callerIds = [...new Set((data || []).map(c => c.caller_id))];
      const hostIds = [...new Set((data || []).map(c => c.host_id))];
      const allIds = [...new Set([...callerIds, ...hostIds])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, app_uid")
        .in("id", allIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      const enriched = (data || []).map(call => ({
        ...call,
        caller_profile: profileMap.get(call.caller_id) || null,
        host_profile: profileMap.get(call.host_id) || null,
      }));

      setCalls(enriched);
    } catch (e) {
      console.error("Error fetching calls:", e);
      recordAdminError({ kind: "rpc", label: "AdminTodayCalls.enriched", message: formatAdminError(e) });
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(["private_calls"], fetchCalls);

  const filtered = calls.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.caller_profile?.display_name?.toLowerCase().includes(q) ||
      c.host_profile?.display_name?.toLowerCase().includes(q) ||
      c.caller_profile?.app_uid?.toLowerCase().includes(q) ||
      c.host_profile?.app_uid?.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const settledCalls = filtered.filter(isSettledCall);
  const callsWithRecordedEarnings = settledCalls.filter(c => getEarnedAmount(c) > 0);

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Phone className="w-6 h-6 text-cyan-500" />
            Today&apos;s Calls
            <Badge className="bg-cyan-500/15 text-cyan-600 border-cyan-500/20 ml-2">
              {calls.length} Total
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Read-only settlement view using stored call earnings</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search caller, host, UID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white border-input text-slate-900 w-64"
            />
          </div>
          <button
            onClick={fetchCalls}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input bg-transparent text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-white border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{calls.length}</p>
            <p className="text-xs text-muted-foreground font-bold">Total Calls</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{settledCalls.length}</p>
            <p className="text-xs text-muted-foreground font-bold">Ended / Settled</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-amber-500">
              {settledCalls.reduce((sum, c) => sum + getSpentAmount(c), 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground font-bold">Diamonds Spent</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-cyan-500">{callsWithRecordedEarnings.length}</p>
            <p className="text-xs text-muted-foreground font-bold">With Host Earnings</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-emerald-50/60 border-emerald-200/60">
        <CardContent className="p-4">
          <p className="text-slate-900 font-bold">Host beans are now shown from stored settlement fields only.</p>
          <p className="text-xs text-emerald-600/80 mt-1">No manual re-credit action is shown here, which avoids duplicate bean crediting.</p>
        </CardContent>
      </Card>

      <Card className="bg-white border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 text-lg">Call Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && calls.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">No calls found today</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((call, i) => (
                <motion.div
                  key={call.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="w-9 h-9 shrink-0">
                        <UserAvatarImage seed={(((call.caller_profile) as any)?.id ?? ((call.caller_profile) as any)?.user_id ?? ((call.caller_profile) as any)?.host_id)} gender={((call.caller_profile) as any)?.gender} src={call.caller_profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                          {call.caller_profile?.display_name?.[0] || "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {call.caller_profile?.display_name || "Unknown Caller"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          <CopyableUid value={call.caller_profile?.app_uid || "N/A"} />
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 text-muted-foreground px-2">
                      <Phone className="w-3 h-3" />→
                    </div>

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="w-9 h-9 shrink-0">
                        <UserAvatarImage seed={(((call.host_profile) as any)?.id ?? ((call.host_profile) as any)?.user_id ?? ((call.host_profile) as any)?.host_id)} gender={((call.host_profile) as any)?.gender} src={call.host_profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-pink-100 text-pink-600 text-xs">
                          {call.host_profile?.display_name?.[0] || "H"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {call.host_profile?.display_name || "Unknown Host"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          <CopyableUid value={call.host_profile?.app_uid || "N/A"} />
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                      <Badge className={getStatusColor(call.status)}>
                        {call.status}
                      </Badge>

                      {call.duration_seconds != null && call.duration_seconds > 0 && (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDuration(call.duration_seconds)}
                        </Badge>
                      )}

                      {getSpentAmount(call) > 0 && (
                        <Badge className="bg-amber-50 text-amber-600 border-amber-200/60">
                          <Gem className="w-3 h-3 mr-1" />
                          {getSpentAmount(call)} spent
                        </Badge>
                      )}

                      {isSettledCall(call) && (
                        getEarnedAmount(call) > 0 ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200/60">
                            {getEarnedAmount(call)} Beans Recorded
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 border-slate-200">
                            No Earnings
                          </Badge>
                        )
                      )}

                      {(call.status === "active" || call.status === "connected") && (
                        call.e2ee_key ? (
                          <Badge
                            className="bg-slate-100 text-slate-600 border-slate-200 cursor-default"
                            title="End-to-end encrypted — admin cannot view media, metadata only."
                          >
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            E2EE
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setMonitorCall(call)}
                          >
                            <EyeOff className="w-3 h-3 mr-1" />
                            Monitor
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span>Created: {new Date(call.created_at).toLocaleTimeString()}</span>
                    {call.connected_at && <span>Connected: {new Date(call.connected_at).toLocaleTimeString()}</span>}
                    {call.ended_at && <span>Ended: {new Date(call.ended_at).toLocaleTimeString()}</span>}
                    {call.end_reason && <span>Reason: {call.end_reason}</span>}
                    {call.diamonds_per_minute && <span>Rate: {call.diamonds_per_minute}/min</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!monitorCall} onOpenChange={(o) => { if (!o) setMonitorCall(null); }}>
        <DialogContent className="bg-white border-border text-slate-900 max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-sm flex items-center gap-2 text-slate-900">
              <EyeOff className="w-4 h-4 text-amber-500" />
              Invisible Call Monitor
            </DialogTitle>
          </DialogHeader>
          {monitorCall && (
            <AdminRoomMonitor
              roomName={`call_${monitorCall.id}`}
              roomType="call"
              label={`${monitorCall.caller_profile?.display_name || "Caller"} ↔ ${monitorCall.host_profile?.display_name || "Host"}`}
              onClose={() => setMonitorCall(null)}
            />
          )}
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            Neither participant receives any signal. No row is written to call_events. Audio starts muted.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
