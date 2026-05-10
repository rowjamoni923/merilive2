import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  Phone, Shield, Calendar, Users, TrendingUp, Loader2,
  ChevronLeft, ChevronRight, Eye, Gavel, Ban, Clock, RefreshCw,
  AlertTriangle, MoreVertical, MessageSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays } from "date-fns";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { recordAdminError } from "@/utils/adminErrorLog";
import { formatAdminError } from "@/utils/formatAdminError";
// useNavigate removed - using onViewChat callback instead

interface ViolationRecord {
  id: string;
  host_id: string;
  violation_number: number;
  detected_content: string | null;
  detected_pattern: string | null;
  source_type: string | null;
  beans_deducted: number | null;
  created_at: string;
  host?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    is_host: boolean | null;
    is_blocked: boolean | null;
    country_flag: string | null;
  };
}

interface DayStat {
  date: string;
  count: number;
  uniqueHosts: number;
}

interface AdminNumberSharingProps {
  onViewChat?: (user: { id: string; display_name: string | null; avatar_url: string | null; app_uid: string | null; is_host?: boolean; is_blocked?: boolean; country_flag?: string | null; user_level?: number }) => void;
  onBanUser?: (user: { id: string; display_name: string | null; avatar_url: string | null; app_uid: string | null; is_host?: boolean; is_blocked?: boolean }) => void;
}

const AdminNumberSharing = ({ onViewChat, onBanUser }: AdminNumberSharingProps = {}) => {
  const { toast } = useToast();
  
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayStats, setDayStats] = useState<DayStat[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [totalToday, setTotalToday] = useState(0);
  const [totalWeek, setTotalWeek] = useState(0);

  // Ban dialog
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banTarget, setBanTarget] = useState<ViolationRecord | null>(null);
  const [banDuration, setBanDuration] = useState("2");
  const [banCustomHours, setBanCustomHours] = useState("");
  const [banReason, setBanReason] = useState("Number Sharing");
  const [banning, setBanning] = useState(false);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("host_contact_violations")
        .select(`
          id, user_id, violation_type, detected_content, severity,
          action_taken, created_at
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Fetch profiles for all hosts
      const hostIds = [...new Set((data || []).map((v: any) => v.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url, app_uid, is_host, is_blocked, country_flag")
        .in("id", hostIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      const enriched = (data || []).map((v: any, index: number) => ({
        ...v,
        host_id: v.user_id,
        violation_number: index + 1,
        detected_pattern: v.violation_type,
        source_type: v.action_taken,
        beans_deducted: v.action_taken === "beans_deducted_2000" ? 2000 : 0,
        host: profileMap[v.user_id] || null,
      }));

      setViolations(enriched);

      // Calculate daily stats for last 14 days
      const now = new Date();
      const stats: DayStat[] = [];
      let todayCount = 0;
      let weekCount = 0;

      for (let i = 0; i < 14; i++) {
        const day = subDays(now, i);
        const dayStr = format(day, "yyyy-MM-dd");
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        const dayViolations = enriched.filter((v: any) => {
          const vDate = new Date(v.created_at);
          return vDate >= dayStart && vDate <= dayEnd;
        });

        const uniqueHosts = new Set(dayViolations.map((v: any) => v.host_id)).size;

        stats.push({ date: dayStr, count: dayViolations.length, uniqueHosts });

        if (i === 0) todayCount = dayViolations.length;
        if (i < 7) weekCount += dayViolations.length;
      }

      setDayStats(stats);
      setTotalToday(todayCount);
      setTotalWeek(weekCount);
    } catch (err) {
      recordAdminError({ kind: "rpc", label: "AdminNumberSharing.FetchViolationsError", message: formatAdminError(err)});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  useAdminRealtime(['host_contact_violations'], () => fetchViolations());

  const openBanDialog = (v: ViolationRecord) => {
    setBanTarget(v);
    setBanDuration("2");
    setBanCustomHours("");
    setBanReason("Number Sharing");
    setShowBanDialog(true);
  };

  const handleBan = async () => {
    if (!banTarget?.host_id) return;
    setBanning(true);
    try {
      const hours = banDuration === "custom" ? parseInt(banCustomHours) : parseInt(banDuration);
      if (!hours || hours < 1) {
        toast({ title: "Invalid duration", variant: "destructive" });
        setBanning(false);
        return;
      }
      const banEnd = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from("live_bans").insert({
        user_id: banTarget.host_id,
        ban_reason: banReason || "Number Sharing",
        violation_type: "contact_sharing",
        ban_duration_hours: hours,
        ban_end: banEnd,
        is_active: true,
        auto_banned: false,
      });

      if (error) throw error;
      toast({ title: "✅ Live Ban Successful", description: `Banned for ${hours} hours` });
      setShowBanDialog(false);
    } catch (err) {
      recordAdminError({ kind: "rpc", label: "AdminNumberSharing.BanError", message: formatAdminError(err)});
      toast({ title: "Ban Failed", variant: "destructive" });
    } finally {
      setBanning(false);
    }
  };

  const filteredViolations = selectedDate
    ? violations.filter((v) => format(new Date(v.created_at), "yyyy-MM-dd") === selectedDate)
    : violations;

  const getSourceLabel = (type: string | null) => {
    switch (type) {
      case "private_message": return "💬 Chat";
      case "live_stream": return "🔴 Live";
      case "chat": return "🎉 Party";
      case "private_call": return "📞 Call";
      default: return type || "—";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Phone className="w-6 h-6 text-red-400" />
            Number Sharing
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Voice & Chat Number Sharing Detection Report
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={fetchViolations}
          disabled={loading}
          className="text-white/50 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 bg-gradient-to-br from-red-900/30 to-slate-800/50 border border-red-500/20 rounded-xl">
          <p className="text-white/50 text-xs mb-1">Today</p>
          <p className="text-2xl font-bold text-red-400">{totalToday}</p>
          <p className="text-white/40 text-[10px]">Detections</p>
        </div>
        <div className="p-4 bg-gradient-to-br from-orange-900/30 to-slate-800/50 border border-orange-500/20 rounded-xl">
          <p className="text-white/50 text-xs mb-1">This Week</p>
          <p className="text-2xl font-bold text-orange-400">{totalWeek}</p>
          <p className="text-white/40 text-[10px]">Detections</p>
        </div>
        <div className="p-4 bg-gradient-to-br from-purple-900/30 to-slate-800/50 border border-purple-500/20 rounded-xl">
          <p className="text-white/50 text-xs mb-1">Total Records</p>
          <p className="text-2xl font-bold text-purple-400">{violations.length}</p>
          <p className="text-white/40 text-[10px]">Violations</p>
        </div>
        <div className="p-4 bg-gradient-to-br from-blue-900/30 to-slate-800/50 border border-blue-500/20 rounded-xl">
          <p className="text-white/50 text-xs mb-1">Unique Hosts</p>
          <p className="text-2xl font-bold text-blue-400">
            {new Set(violations.map(v => v.host_id)).size}
          </p>
          <p className="text-white/40 text-[10px]">Involved</p>
        </div>
      </div>

      {/* Daily Stats Bar */}
      <div className="mb-6">
        <p className="text-white/60 text-sm mb-2 font-medium flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> Daily Report (Last 14 Days)
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedDate(null)}
            className={cn(
              "shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
              !selectedDate
                ? "bg-purple-600 border-purple-500 text-white"
                : "bg-slate-800 border-slate-700 text-white/50 hover:border-purple-500/50"
            )}
          >
            All
          </button>
          {dayStats.map((stat) => (
            <button
              key={stat.date}
              onClick={() => setSelectedDate(stat.date === selectedDate ? null : stat.date)}
              className={cn(
                "shrink-0 px-3 py-2 rounded-lg text-xs border transition-colors text-center min-w-[70px]",
                selectedDate === stat.date
                  ? "bg-red-600 border-red-500 text-white"
                  : stat.count > 0
                    ? "bg-red-900/20 border-red-500/20 text-white/70 hover:border-red-500/50"
                    : "bg-slate-800/50 border-slate-700 text-white/30"
              )}
            >
              <div className="font-bold text-sm">{stat.count}</div>
              <div className="text-[9px] opacity-70">{format(new Date(stat.date), "dd MMM")}</div>
              {stat.uniqueHosts > 0 && (
                <div className="text-[8px] opacity-50">{stat.uniqueHosts} hosts</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Violations List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
        </div>
      ) : filteredViolations.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{selectedDate ? "No detections on this date" : "No number sharing records"}</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-450px)]">
          <div className="space-y-2">
            {filteredViolations.map((v) => {
              // Count total violations for this host
              const hostTotalViolations = violations.filter(vv => vv.host_id === v.host_id).length;
              const warningLevel = hostTotalViolations >= 5 ? 'critical' : hostTotalViolations >= 3 ? 'high' : hostTotalViolations >= 2 ? 'medium' : 'low';
              
              return (
              <div
                key={v.id}
                className={cn(
                  "p-3 border rounded-xl hover:bg-slate-800/70 transition-colors",
                  warningLevel === 'critical' ? "bg-red-900/20 border-red-500/30" :
                  warningLevel === 'high' ? "bg-orange-900/15 border-orange-500/25" :
                  "bg-slate-800/50 border-slate-700"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar + Warning Count */}
                  <div className="relative shrink-0">
                    <Avatar className={cn(
                      "w-10 h-10 border-2",
                      warningLevel === 'critical' ? "border-red-500" :
                      warningLevel === 'high' ? "border-orange-500" :
                      "border-red-500/30"
                    )}>
                      <AvatarImage src={v.host?.avatar_url || ""} />
                      <AvatarFallback className="bg-red-900/50 text-red-300 text-sm">
                        {v.host?.display_name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    {/* Violation count badge on avatar */}
                    <div className={cn(
                      "absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg",
                      warningLevel === 'critical' ? "bg-red-500 animate-pulse" :
                      warningLevel === 'high' ? "bg-orange-500" :
                      "bg-yellow-600"
                    )}>
                      {hostTotalViolations}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">
                        {v.host?.display_name || "Unknown"}
                      </span>
                      <span className="text-white/40 text-xs">
                        UID: {v.host?.app_uid || "—"}
                      </span>
                      {v.host?.is_blocked && (
                        <Badge className="bg-red-600/20 text-red-300 text-[9px]">🚫 Blocked</Badge>
                      )}
                    </div>

                    {/* Warning level indicator */}
                    <div className={cn(
                      "inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                      warningLevel === 'critical' ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                      warningLevel === 'high' ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" :
                      warningLevel === 'medium' ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" :
                      "bg-slate-700/50 text-white/50 border border-slate-600"
                    )}>
                      <AlertTriangle className="w-3 h-3" />
                      {warningLevel === 'critical' ? `⚠️ ${hostTotalViolations}x shared — Ban required!` :
                       warningLevel === 'high' ? `🔴 ${hostTotalViolations}x shared — Warning!` :
                       warningLevel === 'medium' ? `🟡 ${hostTotalViolations}x shared` :
                       `${hostTotalViolations}x shared`}
                    </div>

                    {/* Detected content */}
                    {v.detected_content && (
                      <p className="text-red-300/80 text-xs mt-1 font-mono bg-red-500/10 px-2 py-1 rounded border border-red-500/20 truncate">
                        "{v.detected_content}"
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge className="bg-slate-700/50 text-white/50 text-[9px]">
                        {getSourceLabel(v.source_type)}
                      </Badge>
                      {v.detected_pattern && (
                        <Badge className="bg-slate-700/50 text-white/40 text-[9px]">
                          {v.detected_pattern}
                        </Badge>
                      )}
                      {v.beans_deducted && v.beans_deducted > 0 && (
                        <Badge className="bg-red-600/20 text-red-300 text-[9px]">
                          -{v.beans_deducted} beans
                        </Badge>
                      )}
                      <span className="text-white/30 text-[10px]">
                        {format(new Date(v.created_at), "dd MMM yyyy, hh:mm a")}
                      </span>
                    </div>
                  </div>

                  {/* Three-dot Actions Menu */}
                  <div className="shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-white min-w-[180px] z-50">
                        <DropdownMenuItem
                          className="text-purple-400 hover:text-purple-300 cursor-pointer"
                          onClick={() => {
                            if (v.host && onViewChat) {
                              onViewChat({
                                id: v.host.id,
                                display_name: v.host.display_name,
                                avatar_url: v.host.avatar_url,
                                app_uid: v.host.app_uid,
                                is_host: v.host.is_host ?? false,
                                is_blocked: v.host.is_blocked ?? false,
                                country_flag: v.host.country_flag,
                              });
                            }
                          }}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" /> View Messages
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem
                          className="text-orange-400 hover:text-orange-300 cursor-pointer"
                          onClick={() => openBanDialog(v)}
                        >
                          <Clock className="w-4 h-4 mr-2" /> Temporary Ban
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                          onClick={() => {
                            if (v.host && onBanUser) {
                              onBanUser({
                                id: v.host.id,
                                display_name: v.host.display_name,
                                avatar_url: v.host.avatar_url,
                                app_uid: v.host.app_uid,
                                is_host: v.host.is_host ?? false,
                                is_blocked: v.host.is_blocked ?? false,
                              });
                            }
                          }}
                        >
                          <Ban className="w-4 h-4 mr-2" /> Permanent Ban
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Ban Dialog */}
      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Gavel className="w-5 h-5" />
              Live Ban / Punishment
            </DialogTitle>
          </DialogHeader>

          {banTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                <Avatar className="w-10 h-10 border-2 border-red-500/30">
                  <AvatarImage src={banTarget.host?.avatar_url || ""} />
                  <AvatarFallback className="bg-red-900/50 text-red-300 text-sm">
                    {banTarget.host?.display_name?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium text-sm">{banTarget.host?.display_name}</p>
                  <p className="text-white/40 text-xs">UID: {banTarget.host?.app_uid}</p>
                </div>
              </div>

              <div>
                <p className="text-white/70 text-sm mb-2 font-medium">
                  <Clock className="w-4 h-4 inline mr-1" /> Ban Duration
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: "2", label: "2 Hours" },
                    { value: "3", label: "3 Hours" },
                    { value: "6", label: "6 Hours" },
                    { value: "24", label: "24 Hours" },
                    { value: "48", label: "2 Days" },
                    { value: "72", label: "3 Days" },
                    { value: "168", label: "7 Days" },
                    { value: "custom", label: "Custom" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBanDuration(opt.value)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                        banDuration === opt.value
                          ? "bg-red-600 border-red-500 text-white"
                          : "bg-slate-800 border-slate-700 text-white/60 hover:border-red-500/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {banDuration === "custom" && (
                  <Input
                    type="number"
                    placeholder="Number of hours..."
                    value={banCustomHours}
                    onChange={(e) => setBanCustomHours(e.target.value)}
                    className="mt-2 bg-slate-800 border-slate-700 text-white placeholder:text-white/30"
                  />
                )}
              </div>

              <div>
                <p className="text-white/70 text-sm mb-2 font-medium">Ban Reason</p>
                <Textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-white/30 min-h-[60px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 text-white/60"
                  onClick={() => setShowBanDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleBan}
                  disabled={banning}
                >
                  {banning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ban className="w-4 h-4 mr-1" />}
                  Live Ban
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNumberSharing;
