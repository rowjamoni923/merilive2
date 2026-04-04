import { useState, useEffect, useMemo } from "react";
import { Film, Play, Clock, User, Search, Download, Calendar, Video, Gift, Diamond, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

interface Recording {
  id: string;
  stream_id: string | null;
  host_id: string | null;
  host_name: string | null;
  host_uid: string | null;
  recording_url: string | null;
  recording_sid: string | null;
  channel_name: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string | null;
  total_viewers: number | null;
  total_gifts: number | null;
  total_coins: number | null;
}

interface DayGroup {
  date: string;
  label: string;
  recordings: Recording[];
  totalStreams: number;
  totalDuration: number;
  totalViewers: number;
  totalGifts: number;
  totalCoins: number;
}

interface HostReport {
  hostId: string | null;
  hostName: string | null;
  hostUid: string | null;
  days: DayGroup[];
  totalStreams: number;
  totalDuration: number;
  totalViewers: number;
  totalGifts: number;
  totalCoins: number;
}

export default function AdminRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      // Fetch last 15 days of recordings
      const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("stream_recordings")
        .select("*")
        .gte("started_at", fifteenDaysAgo)
        .order("started_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setRecordings((data as Recording[]) || []);
    } catch (error) {
      console.error("Error fetching recordings:", error);
      toast.error("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  };

  // Build host report with day-by-day breakdown
  const hostReport = useMemo((): HostReport | null => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase().trim();
    const filtered = recordings.filter(rec =>
      rec.host_name?.toLowerCase().includes(query) ||
      rec.host_uid?.toLowerCase().includes(query) ||
      rec.host_id?.toLowerCase().includes(query)
    );

    if (filtered.length === 0) return null;

    // Group by day
    const dayMap = new Map<string, Recording[]>();
    filtered.forEach(rec => {
      const date = rec.started_at ? new Date(rec.started_at).toISOString().split("T")[0] : "unknown";
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(rec);
    });

    const days: DayGroup[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, recs]) => {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let label = date;
        if (date === today) label = "Today";
        else if (date === yesterday) label = "Yesterday";
        else label = new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

        return {
          date,
          label,
          recordings: recs,
          totalStreams: recs.length,
          totalDuration: recs.reduce((s, r) => s + (r.duration_seconds || 0), 0),
          totalViewers: recs.reduce((s, r) => s + (r.total_viewers || 0), 0),
          totalGifts: recs.reduce((s, r) => s + (r.total_gifts || 0), 0),
          totalCoins: recs.reduce((s, r) => s + (r.total_coins || 0), 0),
        };
      });

    return {
      hostId: filtered[0].host_id,
      hostName: filtered[0].host_name,
      hostUid: filtered[0].host_uid,
      days,
      totalStreams: filtered.length,
      totalDuration: filtered.reduce((s, r) => s + (r.duration_seconds || 0), 0),
      totalViewers: filtered.reduce((s, r) => s + (r.total_viewers || 0), 0),
      totalGifts: filtered.reduce((s, r) => s + (r.total_gifts || 0), 0),
      totalCoins: filtered.reduce((s, r) => s + (r.total_coins || 0), 0),
    };
  }, [recordings, searchQuery]);

  // All recordings grouped by day (when no search)
  const allDayGroups = useMemo((): DayGroup[] => {
    if (searchQuery.trim()) return [];
    const dayMap = new Map<string, Recording[]>();
    recordings.forEach(rec => {
      const date = rec.started_at ? new Date(rec.started_at).toISOString().split("T")[0] : "unknown";
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(rec);
    });

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, recs]) => ({
        date,
        label: date === today ? "Today" : date === yesterday ? "Yesterday" : new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        recordings: recs,
        totalStreams: recs.length,
        totalDuration: recs.reduce((s, r) => s + (r.duration_seconds || 0), 0),
        totalViewers: recs.reduce((s, r) => s + (r.total_viewers || 0), 0),
        totalGifts: recs.reduce((s, r) => s + (r.total_gifts || 0), 0),
        totalCoins: recs.reduce((s, r) => s + (r.total_coins || 0), 0),
      }));
  }, [recordings, searchQuery]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatTime = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "recording": return <Badge className="bg-red-500 text-white border-0 text-[10px] animate-pulse">🔴 Recording</Badge>;
      case "completed": return <Badge className="bg-green-500 text-white border-0 text-[10px]">✅ Completed</Badge>;
      default: return <Badge className="bg-yellow-500 text-white border-0 text-[10px]">{status || "Unknown"}</Badge>;
    }
  };

  const renderDayGroup = (day: DayGroup) => (
    <Card key={day.date} className="bg-white border-slate-200 shadow-md overflow-hidden">
      <button
        onClick={() => toggleDay(day.date)}
        className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-pink-500" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-slate-800 text-sm">{day.label}</p>
            <p className="text-[10px] text-slate-400">{day.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-center hidden sm:block">
            <p className="text-xs text-slate-400">Streams</p>
            <p className="font-bold text-slate-800">{day.totalStreams}</p>
          </div>
          <div className="text-center hidden sm:block">
            <p className="text-xs text-slate-400">Duration</p>
            <p className="font-bold text-slate-800">{formatDuration(day.totalDuration)}</p>
          </div>
          <div className="text-center hidden sm:block">
            <p className="text-xs text-slate-400">Gifts</p>
            <p className="font-bold text-pink-500">{day.totalGifts}</p>
          </div>
          <div className="sm:hidden flex items-center gap-2 text-xs text-slate-500">
            <Video className="w-3 h-3" />{day.totalStreams}
            <Clock className="w-3 h-3 ml-1" />{formatDuration(day.totalDuration)}
          </div>
          {expandedDays.has(day.date) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expandedDays.has(day.date) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              {day.recordings.map(rec => (
                <div key={rec.id} className="p-3 sm:p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Video className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {rec.host_name || "Unknown"}
                          </span>
                          {rec.host_uid && <span className="text-[10px] text-slate-400">#{rec.host_uid}</span>}
                          {getStatusBadge(rec.status)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(rec.started_at)} - {formatTime(rec.ended_at)}</span>
                          <span>{formatDuration(rec.duration_seconds || 0)}</span>
                          {rec.total_viewers ? <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{rec.total_viewers}</span> : null}
                          {rec.total_gifts ? <span className="flex items-center gap-1"><Gift className="w-3 h-3 text-pink-400" />{rec.total_gifts}</span> : null}
                          {rec.total_coins ? <span className="flex items-center gap-1"><Diamond className="w-3 h-3 text-cyan-400" />{rec.total_coins}</span> : null}
                          <span>{formatFileSize(rec.file_size_bytes)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {rec.recording_url && rec.status === "completed" && (
                        <>
                          <Button variant="outline" size="sm" className="h-8 text-xs border-pink-200 text-pink-600 hover:bg-pink-50"
                            onClick={() => { setPlayingUrl(rec.recording_url); setPlayingTitle(`${rec.host_name || "Host"} — ${formatTime(rec.started_at)}`); }}>
                            <Play className="w-3.5 h-3.5 mr-1" /> Play
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 px-2"
                            onClick={() => window.open(rec.recording_url!, "_blank")}>
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {rec.status === "recording" && (
                        <Badge className="bg-red-100 text-red-600 border-red-200 animate-pulse text-[10px] py-1">Live Now</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card className="bg-white border-slate-200 shadow-md">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by Host Name, UID, or ID to see their report..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchRecordings}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : searchQuery.trim() ? (
        // Host-specific report
        hostReport ? (
          <div className="space-y-4">
            {/* Host Summary Card */}
            <Card className="bg-gradient-to-r from-pink-500 to-rose-500 border-0 shadow-lg">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{hostReport.hostName || "Unknown Host"}</h3>
                    <p className="text-white/70 text-xs">
                      {hostReport.hostUid ? `UID: ${hostReport.hostUid}` : ""} • Last 15 Days Report
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white/15 rounded-xl p-3 text-center">
                    <p className="text-white/70 text-[10px]">Total Streams</p>
                    <p className="text-white font-bold text-xl">{hostReport.totalStreams}</p>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 text-center">
                    <p className="text-white/70 text-[10px]">Total Duration</p>
                    <p className="text-white font-bold text-xl">{formatDuration(hostReport.totalDuration)}</p>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 text-center">
                    <p className="text-white/70 text-[10px]">Total Viewers</p>
                    <p className="text-white font-bold text-xl">{hostReport.totalViewers}</p>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 text-center">
                    <p className="text-white/70 text-[10px]">Total Gifts</p>
                    <p className="text-white font-bold text-xl">{hostReport.totalGifts}</p>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                    <p className="text-white/70 text-[10px]">Total Diamonds</p>
                    <p className="text-white font-bold text-xl">{hostReport.totalCoins}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Day-by-day breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Day-by-Day Breakdown
              </h4>
              {hostReport.days.map(day => renderDayGroup(day))}
            </div>
          </div>
        ) : (
          <Card className="bg-white border-slate-200 shadow-lg">
            <CardContent className="p-8 sm:p-12 text-center">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No recordings found for "{searchQuery}"</p>
              <p className="text-slate-400 text-xs mt-1">Try searching by host name, UID, or host ID</p>
            </CardContent>
          </Card>
        )
      ) : (
        // All recordings grouped by day
        allDayGroups.length === 0 ? (
          <Card className="bg-white border-slate-200 shadow-lg">
            <CardContent className="p-8 sm:p-12 text-center">
              <Film className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No recordings found</p>
              <p className="text-slate-400 text-xs mt-1">Recordings are auto-saved and kept for 15 days</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {allDayGroups.map(day => renderDayGroup(day))}
          </div>
        )
      )}

      {/* Video Player Dialog */}
      <Dialog open={!!playingUrl} onOpenChange={() => setPlayingUrl(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 bg-black border-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-white text-sm">{playingTitle}</DialogTitle>
          </DialogHeader>
          {playingUrl && (
            <video key={playingUrl} src={playingUrl} controls autoPlay crossOrigin="anonymous" className="w-full aspect-video object-contain" 
              onError={(e) => {
                console.error("Recording playback error:", e.currentTarget.error);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
