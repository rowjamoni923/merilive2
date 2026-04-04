import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Search, RefreshCw, CheckCircle, XCircle, Clock, Coins, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import useAdminRealtime from "@/hooks/useAdminRealtime";

interface CallRecord {
  id: string;
  caller_id: string;
  host_id: string;
  status: string;
  duration_seconds: number | null;
  coins_spent: number | null;
  host_earned: number | null;
  host_earnings_amount: number | null;
  host_earnings_credited: boolean | null;
  host_earnings_credited_at: string | null;
  coins_per_minute: number | null;
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  caller_profile?: { display_name: string | null; avatar_url: string | null; app_uid: string | null };
  host_profile?: { display_name: string | null; avatar_url: string | null; app_uid: string | null };
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
    case "completed": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "active": case "connected": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "missed": case "timeout": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "rejected": case "cancelled": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
};

export default function AdminTodayCalls() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fetchCalls = async () => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("private_calls")
        .select(`
          id, caller_id, host_id, status, duration_seconds, coins_spent,
          host_earned, host_earnings_amount, host_earnings_credited,
          host_earnings_credited_at, coins_per_minute, created_at,
          connected_at, ended_at, end_reason
        `)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Fetch profiles for callers and hosts
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
    } finally {
      setLoading(false);
    }
  };

  
  useAdminRealtime(["private_calls"], fetchCalls);

  const handleConfirmEarnings = async (call: CallRecord) => {
    if (!call.host_earnings_amount || call.host_earnings_amount <= 0) {
      toast.error("No earnings amount to credit");
      return;
    }

    setConfirmingId(call.id);
    try {
      // Credit beans to host
      const { error: updateError } = await supabase.rpc("admin_credit_host_call_earnings" as any, {
        p_call_id: call.id,
        p_host_id: call.host_id,
        p_amount: call.host_earnings_amount,
      });

      if (updateError) {
        // Fallback: direct update
        const { error: directError } = await supabase
          .from("private_calls")
          .update({
            host_earnings_credited: true,
            host_earnings_credited_at: new Date().toISOString(),
          })
          .eq("id", call.id);

        if (directError) throw directError;

        // Update host beans
        const { data: hostProfile } = await supabase
          .from("profiles")
          .select("beans")
          .eq("id", call.host_id)
          .single();

        if (hostProfile) {
          await supabase
            .from("profiles")
            .update({ beans: (hostProfile.beans || 0) + Math.floor(call.host_earnings_amount) })
            .eq("id", call.host_id);
        }
      }

      toast.success(`✅ ${call.host_earnings_amount} Beans credited to host successfully!`);
      fetchCalls();
    } catch (e: any) {
      console.error("Error confirming earnings:", e);
      toast.error("Failed to credit earnings: " + (e.message || "Unknown error"));
    } finally {
      setConfirmingId(null);
    }
  };

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

  const completedCalls = filtered.filter(c => c.status === "completed");
  const uncreditedCalls = completedCalls.filter(c => !c.host_earnings_credited && (c.host_earnings_amount || 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Phone className="w-6 h-6 text-cyan-400" />
            Today's Calls
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 ml-2">
              {calls.length} Total
            </Badge>
            {uncreditedCalls.length > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 ml-1">
                {uncreditedCalls.length} Uncredited
              </Badge>
            )}
          </h1>
          <p className="text-sm text-slate-400 mt-1">All private calls made today with earnings status</p>
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
          <Button onClick={fetchCalls} variant="outline" size="icon" className="border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-white">{calls.length}</p>
            <p className="text-xs text-slate-400 font-bold">Total Calls</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{completedCalls.length}</p>
            <p className="text-xs text-slate-400 font-bold">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-amber-400">
              {completedCalls.reduce((sum, c) => sum + (c.coins_spent || 0), 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 font-bold">Coins Spent</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-red-400">{uncreditedCalls.length}</p>
            <p className="text-xs text-slate-400 font-bold">Uncredited</p>
          </CardContent>
        </Card>
      </div>

      {/* Uncredited Warning */}
      {uncreditedCalls.length > 0 && (
        <Card className="bg-gradient-to-r from-red-900/40 to-orange-900/40 border-red-500/40">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-white font-bold">{uncreditedCalls.length} calls have uncredited host earnings!</p>
              <p className="text-xs text-red-300/70">These calls completed but diamonds were not credited to hosts. Use Confirm button to credit manually.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call List */}
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
                    {/* Caller */}
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

                    {/* Arrow */}
                    <div className="hidden sm:flex items-center gap-1 text-slate-500 px-2">
                      <Phone className="w-3 h-3" />→
                    </div>

                    {/* Host */}
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

                    {/* Stats */}
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

                      {(call.coins_spent || 0) > 0 && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Coins className="w-3 h-3 mr-1" />
                          {call.coins_spent} spent
                        </Badge>
                      )}

                      {call.status === "completed" && (
                        <>
                          {call.host_earnings_credited ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {call.host_earnings_amount || call.host_earned || 0} Credited
                            </Badge>
                          ) : (call.host_earnings_amount || 0) > 0 ? (
                            <Button
                              size="sm"
                              disabled={confirmingId === call.id}
                              onClick={() => handleConfirmEarnings(call)}
                              className="bg-red-600 hover:bg-red-500 text-white text-xs h-7 px-3"
                            >
                              {confirmingId === call.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 mr-1" />
                              )}
                              Confirm {call.host_earnings_amount} Beans
                            </Button>
                          ) : (
                            <Badge className="bg-slate-600/50 text-slate-400 border-slate-500/30">
                              <XCircle className="w-3 h-3 mr-1" />
                              No Earnings
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Time info */}
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
