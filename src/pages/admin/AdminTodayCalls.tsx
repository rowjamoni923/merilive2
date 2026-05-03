import { useState } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Search, RefreshCw, Clock, Coins } from "lucide-react";
import { motion } from "framer-motion";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { recordAdminError } from "@/utils/adminErrorLog";

interface CallRecord {
  id: string;
  caller_id: string;
  host_id: string;
  status: string;
  duration_seconds: number | null;
  coins_spent: number | null;
  total_coins_deducted: number | null;
  host_earned: number | null;
  host_earnings_amount: number | null;
  host_earnings_credited: boolean | null;
  host_earnings_credited_at: string | null;
  coins_per_minute: number | null;
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
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
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "missed":
    case "timeout":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "rejected":
    case "cancelled":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
};

const getSpentAmount = (call: CallRecord) => Number(call.total_coins_deducted ?? call.coins_spent ?? 0);
const getEarnedAmount = (call: CallRecord) => Number(call.host_earnings_amount ?? call.host_earned ?? 0);
const isSettledCall = (call: CallRecord) => call.status === "ended" || call.status === "completed";

export default function AdminTodayCalls() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("private_calls")
        .select(`
          id, caller_id, host_id, status, duration_seconds, coins_spent,
          total_coins_deducted, host_earned, host_earnings_amount, host_earnings_credited,
          host_earnings_credited_at, coins_per_minute, created_at,
          connected_at, ended_at, end_reason
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
      recordAdminError({ kind: "rpc", label: "AdminTodayCalls.enriched", message: e instanceof Error ? e.message : String(e) });
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Phone className="w-6 h-6 text-cyan-400" />
            Today&apos;s Calls
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 ml-2">
              {calls.length} Total
            </Badge>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Read-only settlement view using stored call earnings</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search caller, host, UID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white w-64"
            />
          </div>
          <button
            onClick={fetchCalls}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 bg-transparent text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-white">{calls.length}</p>
            <p className="text-xs text-slate-400 font-bold">Total Calls</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{settledCalls.length}</p>
            <p className="text-xs text-slate-400 font-bold">Ended / Settled</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-amber-400">
              {settledCalls.reduce((sum, c) => sum + getSpentAmount(c), 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 font-bold">Diamonds Spent</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-cyan-400">{callsWithRecordedEarnings.length}</p>
            <p className="text-xs text-slate-400 font-bold">With Host Earnings</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-emerald-900/30 to-cyan-900/30 border-emerald-500/30">
        <CardContent className="p-4">
          <p className="text-white font-bold">Host beans are now shown from stored settlement fields only.</p>
          <p className="text-xs text-emerald-200/80 mt-1">No manual re-credit action is shown here, which avoids duplicate bean crediting.</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg">Call Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && calls.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">No calls found today</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {filtered.map((call, i) => (
                <motion.div
                  key={call.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="p-4 hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarImage src={call.caller_profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-blue-900 text-blue-300 text-xs">
                          {call.caller_profile?.display_name?.[0] || "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {call.caller_profile?.display_name || "Unknown Caller"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          UID: {call.caller_profile?.app_uid || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 text-slate-500 px-2">
                      <Phone className="w-3 h-3" />→
                    </div>

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarImage src={call.host_profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-pink-900 text-pink-300 text-xs">
                          {call.host_profile?.display_name?.[0] || "H"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {call.host_profile?.display_name || "Unknown Host"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          UID: {call.host_profile?.app_uid || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                      <Badge className={getStatusColor(call.status)}>
                        {call.status}
                      </Badge>

                      {call.duration_seconds != null && call.duration_seconds > 0 && (
                        <Badge className="bg-slate-700 text-slate-300 border-slate-600">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDuration(call.duration_seconds)}
                        </Badge>
                      )}

                      {getSpentAmount(call) > 0 && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Coins className="w-3 h-3 mr-1" />
                          {getSpentAmount(call)} spent
                        </Badge>
                      )}

                      {isSettledCall(call) && (
                        getEarnedAmount(call) > 0 ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            {getEarnedAmount(call)} Beans Recorded
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-600/50 text-slate-400 border-slate-500/30">
                            No Earnings
                          </Badge>
                        )
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
                    <span>Created: {new Date(call.created_at).toLocaleTimeString()}</span>
                    {call.connected_at && <span>Connected: {new Date(call.connected_at).toLocaleTimeString()}</span>}
                    {call.ended_at && <span>Ended: {new Date(call.ended_at).toLocaleTimeString()}</span>}
                    {call.end_reason && <span>Reason: {call.end_reason}</span>}
                    {call.coins_per_minute && <span>Rate: {call.coins_per_minute}/min</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
