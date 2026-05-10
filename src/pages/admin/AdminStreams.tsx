import { useState, useEffect, useCallback } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Video, Search, Eye, Clock, Users, Gift, Diamond, RefreshCw, StopCircle, Play, Film, MonitorPlay, Ban, AlertTriangle, Skull, Heart, Timer, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import AdminStreamViewer from "@/components/admin/AdminStreamViewer";
import AdminRecordings from "@/components/admin/AdminRecordings";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface LiveStream {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  viewer_count: number;
  total_gifts: number;
  total_coins_earned: number;
  started_at: string | null;
  created_at: string;
  host: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

interface LiveBan {
  id: string;
  user_id: string;
  ban_reason: string | null;
  violation_type: string | null;
  ban_duration_hours: number | null;
  ban_end: string | null;
  is_active: boolean;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  };
}

function BanCountdown({ banEnd }: { banEnd: string | null }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!banEnd) { setRemaining("Permanent"); return; }
    const update = () => {
      const diff = new Date(banEnd).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [banEnd]);
  return (
    <span className={`font-mono text-sm font-bold ${remaining === "Permanent" ? "text-red-600" : remaining === "Expired" ? "text-green-600" : "text-orange-600"}`}>
      {remaining}
    </span>
  );
}

function BanCard({ ban, onUnban }: { ban: LiveBan; onUnban: () => void }) {
  return (
    <Card className="bg-white border-red-200 shadow-md overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-red-200">
            <AvatarImage src={ban.profile?.avatar_url || ""} />
            <AvatarFallback className="bg-red-100 text-red-500">{ban.profile?.display_name?.charAt(0) || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 font-medium truncate text-sm">{ban.profile?.display_name || "Unknown"}</p>
            <p className="text-slate-400 text-[10px]">UID: {ban.profile?.app_uid || ban.user_id.slice(0, 8)}</p>
          </div>
          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
            <Ban className="w-3 h-3 mr-1" /> Banned
          </Badge>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 flex items-center gap-1"><Timer className="w-3 h-3" /> Remaining</span>
            <BanCountdown banEnd={ban.ban_end} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Violation</span>
            <span className="text-slate-700 font-medium capitalize">{ban.violation_type?.replace(/_/g, " ") || "Manual"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Duration</span>
            <span className="text-slate-700">{ban.ban_duration_hours ? `${ban.ban_duration_hours}h` : "Permanent"}</span>
          </div>
          {ban.ban_reason && (
            <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 mt-1">Reason: {ban.ban_reason}</p>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs border-green-300 text-green-700 hover:bg-green-50" onClick={onUnban}>
          Remove Ban
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminStreams() {
  const [streams, setStreams] = useState<LiveStream[]>(() => getAdminCache<LiveStream[]>('admin_streams') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_streams'));
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [stats, setStats] = useState({ totalActive: 0, totalViewers: 0, totalGifts: 0, totalCoins: 0 });
  const [watchingStream, setWatchingStream] = useState<LiveStream | null>(null);
  const [activeTab, setActiveTab] = useState("live");
  const [stopStreamDialog, setStopStreamDialog] = useState<{ streamId: string; hostId: string; hostName: string; hostAvatar: string | null } | null>(null);
  const [stopReason, setStopReason] = useState("");
  const [stopping, setStopping] = useState(false);
  const [applyBan, setApplyBan] = useState(false);
  const [banDuration, setBanDuration] = useState("2");
  const [banViolationType, setBanViolationType] = useState("inappropriate_content");
  const [activeBans, setActiveBans] = useState<LiveBan[]>([]);
  const [bansLoading, setBansLoading] = useState(false);

  const BAN_DURATION_OPTIONS = [
    { value: "1", label: "1 Hour" },
    { value: "2", label: "2 Hours" },
    { value: "5", label: "5 Hours" },
    { value: "10", label: "10 Hours" },
    { value: "24", label: "24 Hours (1 Day)" },
    { value: "48", label: "48 Hours (2 Days)" },
    { value: "72", label: "72 Hours (3 Days)" },
    { value: "168", label: "1 Week" },
    { value: "permanent", label: "Permanent" },
  ];

  const VIOLATION_TYPES = [
    { value: "face_absence", label: "Face Absence", icon: Eye, color: "text-yellow-500" },
    { value: "drugs", label: "Drugs/Substances", icon: Skull, color: "text-red-500" },
    { value: "sexual_content", label: "Sexual Content", icon: Heart, color: "text-pink-500" },
    { value: "inappropriate_content", label: "Inappropriate Content", icon: AlertTriangle, color: "text-orange-500" },
  ];

  const calculateStatsFromStreams = useCallback((streamList: LiveStream[]) => {
    const activeStreams = streamList.filter(s => s.is_active);
    setStats({
      totalActive: activeStreams.length,
      totalViewers: activeStreams.reduce((sum, s) => sum + (s.viewer_count || 0), 0),
      totalGifts: activeStreams.reduce((sum, s) => sum + (s.total_gifts || 0), 0),
      totalCoins: activeStreams.reduce((sum, s) => sum + (s.total_coins_earned || 0), 0),
    });
  }, []);

  const fetchStreams = useCallback(async () => {
    if (streams.length === 0) setLoading(true);
    try {
      let query = supabase
        .from("live_streams")
        .select(`id, title, description, is_active, viewer_count, total_gifts, total_coins_earned, started_at, created_at, host:profiles!live_streams_host_id_fkey(id, display_name, avatar_url, is_verified)`)
        .order("created_at", { ascending: false });

      if (statusFilter === "active") query = query.eq("is_active", true);
      else if (statusFilter === "ended") query = query.eq("is_active", false);

      const { data, error } = await query.limit(50);
      if (error) throw error;

      const formattedData = (data || []).map(stream => ({
        ...stream, host: Array.isArray(stream.host) ? stream.host[0] : stream.host
      })) as LiveStream[];

      setStreams(formattedData);
      calculateStatsFromStreams(formattedData);
    } catch (error) {
      console.error("Error fetching streams:", error);
      recordAdminError({ kind: "rpc", label: "AdminStreams.formattedData", message: formatAdminError(error) });
      toast.error("Failed to load streams");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, calculateStatsFromStreams]);

  const fetchActiveBans = useCallback(async () => {
    setBansLoading(true);
    try {
      const { data, error } = await supabase
        .from("live_bans" as any)
        .select("id, user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = (data || []).map((b: any) => b.user_id);
      let profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid")
          .in("id", userIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      setActiveBans((data || []).map((b: any) => ({
        ...b,
        profile: profileMap[b.user_id] || null,
      })));
    } catch (err) {
      console.error("Error fetching bans:", err);
      recordAdminError({ kind: "rpc", label: "AdminStreams.userIds", message: formatAdminError(err) });
    } finally {
      setBansLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStreams();
    void fetchActiveBans();
  }, [fetchStreams, fetchActiveBans]);

  useAdminRealtime(['live_bans'], () => {
    void fetchActiveBans();
  });

  useEffect(() => {
    const handleRealtimeStreamUpdates = (event: Event) => {
      const detail = (event as CustomEvent<{ table: string; eventType: string; payload?: any }>).detail;
      if (!detail || detail.table !== 'live_streams') return;

      const changedRow = detail.payload;
      if (detail.eventType === 'UPDATE' && changedRow?.is_active === false) {
        if (watchingStream?.id === changedRow.id) setWatchingStream(null);
        void fetchStreams();
      }

      if (detail.eventType === 'INSERT' && changedRow?.is_active === true) {
        void fetchStreams();
      }

      if (detail.eventType === 'DELETE') {
        void fetchStreams();
      }
    };

    window.addEventListener('admin-table-update', handleRealtimeStreamUpdates);
    return () => window.removeEventListener('admin-table-update', handleRealtimeStreamUpdates);
  }, [fetchStreams, watchingStream?.id]);

  const forceCloseStreamSession = useCallback(async (streamId: string, hostName: string) => {
    const now = new Date().toISOString();

    await Promise.allSettled([
      supabase
        .from("stream_viewers")
        .update({ left_at: now } as any)
        .eq("stream_id", streamId)
        .is("left_at", null),
      supabase.channel(`live-stream-close-${streamId}`).send({
        type: "broadcast",
        event: "stream_closed",
        payload: { streamId, hostName },
      }),
    ]);
  }, []);

  const openStopDialog = (stream: LiveStream) => {
    setStopStreamDialog({
      streamId: stream.id,
      hostId: stream.host?.id || "",
      hostName: stream.host?.display_name || "Host",
      hostAvatar: stream.host?.avatar_url || null,
    });
    setStopReason("");
    setApplyBan(false);
    setBanDuration("2");
    setBanViolationType("inappropriate_content");
  };

  const handleEndStream = async () => {
    if (!stopStreamDialog) return;
    setStopping(true);
    const { streamId, hostId, hostName, hostAvatar } = stopStreamDialog;
    const reason = stopReason.trim() || "Policy violation";

    try {
      const now = new Date().toISOString();

      // 1) End stream immediately
      const { error } = await supabase
        .from("live_streams")
        .update({ is_active: false, ended_at: now, viewer_count: 0 })
        .eq("id", streamId);
      if (error) throw error;

      // 1.1) Instant admin UI update (no waiting)
      setStreams((prev) => {
        const updated = prev.map((stream) =>
          stream.id === streamId ? { ...stream, is_active: false, viewer_count: 0 } : stream
        );

        const next = statusFilter === "active" ? updated.filter((stream) => stream.id !== streamId) : updated;
        calculateStatsFromStreams(next);
        return next;
      });

      if (watchingStream?.id === streamId) setWatchingStream(null);

      // 1.2) Force viewers out of this live instantly
      await forceCloseStreamSession(streamId, hostName);

      // 2) Send warning notification to host
      if (hostId) {
        const banLabel = applyBan
          ? banDuration === "permanent"
            ? " You have been permanently banned from going live."
            : ` You have been banned from going live for ${BAN_DURATION_OPTIONS.find((o) => o.value === banDuration)?.label}.`
          : "";

        await adminSendNotification(hostId, '⚠️ Live Stream Stopped', `Your live stream has been stopped by the admin team. Reason: "${reason}".${banLabel} Please ensure you follow community guidelines.`, 'admin_warning');
      }

      // 3) Apply ban (optional)
      if (applyBan && hostId) {
        const banEnd = banDuration === "permanent"
          ? null
          : new Date(Date.now() + parseInt(banDuration) * 60 * 60 * 1000).toISOString();

        const banPayload = {
          user_id: hostId,
          ban_reason: reason,
          violation_type: banViolationType,
          ban_duration_hours: banDuration === "permanent" ? null : parseInt(banDuration),
          ban_end: banEnd,
          is_active: true,
          auto_banned: false,
        };

        const { data: banData, error: banError } = await supabase.functions.invoke("admin-chat-inspector/create-ban", {
          body: banPayload,
        });

        if (banError || banData?.error) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-chat-inspector/create-ban`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session?.access_token}`,
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify(banPayload),
            });

            const fallbackData = await resp.json();
            if (!resp.ok || fallbackData?.error) {
              toast.error(`Stream stopped but ban failed: ${fallbackData?.error || "Unknown error"}`);
              setStopStreamDialog(null);
              await Promise.all([fetchStreams(), fetchActiveBans()]);
              return;
            }
          } catch (fetchErr) {
            console.error("[AdminStreams] Fallback ban also failed:", fetchErr);
            recordAdminError({ kind: "rpc", label: "AdminStreams.fallbackData", message: formatAdminError(fetchErr)});
            toast.error("Stream stopped but ban failed to apply");
            setStopStreamDialog(null);
            await Promise.all([fetchStreams(), fetchActiveBans()]);
            return;
          }
        }

        setActiveBans((prev) => [
          {
            id: `temp-${Date.now()}`,
            user_id: hostId,
            ban_reason: reason,
            violation_type: banViolationType,
            ban_duration_hours: banDuration === "permanent" ? null : parseInt(banDuration),
            ban_end: banEnd,
            is_active: true,
            created_at: now,
            profile: {
              display_name: hostName,
              avatar_url: hostAvatar,
              app_uid: null,
            },
          },
          ...prev.filter((ban) => ban.user_id !== hostId),
        ]);

        const banLabel = banDuration === "permanent" ? "permanently" : `for ${BAN_DURATION_OPTIONS.find((o) => o.value === banDuration)?.label}`;
        toast.success(`Stream stopped & ${hostName} banned from live ${banLabel}`);
      } else {
        toast.success(`Stream stopped — ${hostName} has been notified`);
      }

      setStopStreamDialog(null);
      await Promise.all([fetchStreams(), fetchActiveBans()]);
    } catch (error) {
      console.error("Error ending stream:", error);
      recordAdminError({ kind: "rpc", label: "AdminStreams.banLabel", message: formatAdminError(error) });
      toast.error("Failed to end stream");
    } finally {
      setStopping(false);
    }
  };

  const filteredStreams = streams.filter(stream =>
    stream.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.host?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (startedAt: string | null) => {
    if (!startedAt) return "-";
    const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  const formatCoins = (coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Video className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              Live Stream Monitoring
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-1">Real-time stream observation & recordings</p>
          </div>
          <Button onClick={fetchStreams} variant="outline" className="border-white/30 text-white hover:bg-white/20 w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-red-500/20 flex items-center justify-center">
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
              </div>
              <div>
                <p className="text-slate-600 text-[10px] sm:text-xs">Live Streams</p>
                <p className="text-slate-900 font-bold text-lg sm:text-2xl">{stats.totalActive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-slate-600 text-[10px] sm:text-xs">Total Viewers</p>
                <p className="text-slate-900 font-bold text-lg sm:text-2xl">{stats.totalViewers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-pink-500/20 flex items-center justify-center">
                <Gift className="w-5 h-5 sm:w-6 sm:h-6 text-pink-500" />
              </div>
              <div>
                <p className="text-slate-600 text-[10px] sm:text-xs">Total Gifts</p>
                <p className="text-slate-900 font-bold text-lg sm:text-2xl">{stats.totalGifts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50 to-amber-100 border-yellow-200 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Diamond className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-slate-600 text-[10px] sm:text-xs">Total Diamonds</p>
                <p className="text-slate-900 font-bold text-lg sm:text-2xl">{formatCoins(stats.totalCoins)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-slate-200 shadow-sm">
          <TabsTrigger value="live" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
            <MonitorPlay className="w-4 h-4 mr-2" /> Live Streams
          </TabsTrigger>
          <TabsTrigger value="banned" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ShieldAlert className="w-4 h-4 mr-2" /> Banned ({activeBans.length})
          </TabsTrigger>
          <TabsTrigger value="recordings" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
            <Film className="w-4 h-4 mr-2" /> Recordings (15 Days)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4 mt-4">
          <Card className="bg-white border-slate-200 shadow-md">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search by title or host name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48 bg-slate-50 border-slate-200 text-slate-900">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="all">All Streams</SelectItem>
                    <SelectItem value="active">Live</SelectItem>
                    <SelectItem value="ended">Ended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredStreams.length === 0 ? (
            <Card className="bg-white border-slate-200 shadow-lg">
              <CardContent className="p-8 sm:p-12 text-center">
                <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No streams found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredStreams.map((stream) => (
                <motion.div key={stream.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="bg-white border-slate-200 overflow-hidden hover:shadow-xl transition-all shadow-lg">
                    <div className="relative aspect-video bg-gradient-to-br from-purple-100 to-pink-100">
                      {stream.is_active ? (
                        <AdminStreamViewer
                          streamId={stream.id}
                          roomName={`live_${stream.id}`}
                          hostName={stream.host?.display_name || "Host"}
                          onClose={() => {}}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Video className="w-12 h-12 text-slate-300" />
                        </div>
                      )}
                      {stream.is_active && (
                        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex items-center gap-1 sm:gap-2 z-10">
                          <Badge className="bg-red-500 text-white border-0 animate-pulse text-[10px] sm:text-xs">🔴 LIVE</Badge>
                          <Badge className="bg-black/50 text-white border-0 text-[10px] sm:text-xs"><Eye className="w-3 h-3 mr-1" />{stream.viewer_count || 0}</Badge>
                        </div>
                      )}
                      {!stream.is_active && (
                        <div className="absolute top-2 sm:top-3 left-2 sm:left-3">
                          <Badge className="bg-gray-500/80 text-white border-0 text-[10px] sm:text-xs">Ended</Badge>
                        </div>
                      )}
                      <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10">
                        <Badge className="bg-black/50 text-white border-0 text-[10px] sm:text-xs"><Clock className="w-3 h-3 mr-1" />{formatDuration(stream.started_at)}</Badge>
                      </div>
                    </div>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3">
                        <Avatar className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-pink-200">
                          <AvatarImage src={stream.host?.avatar_url || ""} />
                          <AvatarFallback className="bg-pink-100 text-pink-500">{stream.host?.display_name?.charAt(0) || "H"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 font-medium truncate text-sm sm:text-base">{stream.host?.display_name || "Unknown Host"}</p>
                          <p className="text-slate-500 text-[10px] sm:text-xs truncate">{stream.title || "Live Stream"}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-3 sm:mb-4">
                        <div className="flex items-center gap-1 text-pink-500"><Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="font-medium">{stream.total_gifts || 0}</span></div>
                        <div className="flex items-center gap-1 text-yellow-600"><Diamond className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="font-medium">{formatCoins(stream.total_coins_earned || 0)}</span></div>
                      </div>
                      <div className="flex gap-2">
                        {stream.is_active && (
                            <Button variant="destructive" className="flex-1 text-sm" size="sm" onClick={() => openStopDialog(stream)}>
                              <StopCircle className="w-4 h-4 mr-1" /> Stop Stream
                            </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="banned" className="space-y-4 mt-4">
          {bansLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeBans.length === 0 ? (
            <Card className="bg-white border-slate-200 shadow-lg">
              <CardContent className="p-8 sm:p-12 text-center">
                <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No active live bans</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {activeBans.map((ban) => (
                <BanCard key={ban.id} ban={ban} onUnban={async () => {
                  try {
                    await supabase.from("live_bans" as any).update({ is_active: false, unbanned_at: new Date().toISOString() } as any).eq("id", ban.id);
                    toast.success("Ban removed");
                    fetchActiveBans();
                  } catch { toast.error("Failed to remove ban"); }
                }} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recordings" className="mt-4">
          <AdminRecordings />
        </TabsContent>
      </Tabs>

      {/* Live Stream Watch Dialog */}
      <Dialog open={!!watchingStream} onOpenChange={() => setWatchingStream(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 bg-black border-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent">
            <DialogTitle className="text-white flex items-center gap-2 text-sm sm:text-base">
              <Badge className="bg-red-500 text-white border-0 animate-pulse text-[10px]">🔴 LIVE</Badge>
              {watchingStream?.host?.display_name} — {watchingStream?.title || "Live Stream"}
            </DialogTitle>
          </DialogHeader>
          {watchingStream && (
            <AdminStreamViewer
              streamId={watchingStream.id}
              roomName={`live_${watchingStream.id}`}
              hostName={watchingStream.host?.display_name || "Host"}
              onClose={() => setWatchingStream(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Stop Stream Reason Dialog */}
      <AlertDialog open={!!stopStreamDialog} onOpenChange={(open) => { if (!open) setStopStreamDialog(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <StopCircle className="w-5 h-5" />
              Stop {stopStreamDialog?.hostName}'s Stream
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately end the live stream. The host will receive a warning notification with the reason you provide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for stopping</label>
              <Textarea
                placeholder="e.g. Inappropriate content, no face visible, policy violation..."
                value={stopReason}
                onChange={(e) => setStopReason(e.target.value)}
                rows={3}
                className="resize-none"
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">{stopReason.length}/300</p>
            </div>

            {/* Live Ban Toggle */}
            <div className="border border-destructive/20 rounded-lg p-3 space-y-3 bg-destructive/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-destructive" />
                  <Label className="text-sm font-medium">Apply Live Ban</Label>
                </div>
                <Switch checked={applyBan} onCheckedChange={setApplyBan} />
              </div>

              {applyBan && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-xs text-muted-foreground">Violation Type</Label>
                    <Select value={banViolationType} onValueChange={setBanViolationType}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIOLATION_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className={`w-3.5 h-3.5 ${type.color}`} />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ban Duration</Label>
                    <Select value={banDuration} onValueChange={setBanDuration}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BAN_DURATION_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleEndStream} disabled={stopping}>
              {stopping ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Stopping...</> : 
                applyBan ? <><Ban className="w-4 h-4 mr-2" /> Stop & Ban Host</> : <><StopCircle className="w-4 h-4 mr-2" /> Stop & Notify Host</>}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
