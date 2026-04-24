import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Video,
  Search,
  Eye,
  Clock,
  Users,
  Gift,
  Diamond,
  RefreshCw,
  Play,
  Download,
  Trash2,
  Calendar,
  Filter,
  User,
  CheckCircle,
  XCircle,
  Loader2,
  Film
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getCurrentAdminId } from "@/utils/adminSession";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface Recording {
  id: string;
  stream_id: string;
  host_id: string;
  host_uid: string | null;
  host_name: string | null;
  recording_url: string | null;
  recording_sid: string | null;
  resource_id: string | null;
  channel_name: string | null;
  duration_seconds: number;
  file_size_bytes: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  expires_at: string;
  thumbnail_url: string | null;
  total_viewers: number;
  total_gifts: number;
  total_coins: number;
  created_at: string;
  host?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    app_uid: string | null;
    is_verified: boolean;
  };
}

export default function AdminRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [stats, setStats] = useState({
    totalRecordings: 0,
    readyRecordings: 0,
    totalDuration: 0,
    expiringToday: 0
  });

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const adminId = getCurrentAdminId();
      if (!adminId) { setRecordings([]); return; }
      const { data, error } = await supabase.rpc("admin_list_recordings", {
        _admin_id: adminId,
        _limit: 200,
      });
      if (error) throw error;
      const now = new Date();
      const allRows = (data || []) as any[];
      const validRows = allRows.filter((r) => !r.expires_at || new Date(r.expires_at) >= now);
      const filteredRows = statusFilter !== "all" ? validRows.filter((r) => r.status === statusFilter) : validRows;

      // Enrich with host profile info
      const hostIds = Array.from(new Set(filteredRows.map((r) => r.host_id).filter(Boolean)));
      let hostMap: Record<string, any> = {};
      if (hostIds.length) {
        const { data: hosts } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_verified")
          .in("id", hostIds);
        hostMap = Object.fromEntries((hosts || []).map((h: any) => [h.id, h]));
      }
      const formattedData = filteredRows.map((rec: any) => ({
        ...rec,
        host: hostMap[rec.host_id] || null,
      })) as Recording[];

      setRecordings(formattedData);

      const expiringToday = formattedData.filter((r) => {
        const expiresAt = new Date(r.expires_at);
        return differenceInDays(expiresAt, now) <= 1;
      }).length;

      setStats({
        totalRecordings: validRows.length,
        readyRecordings: validRows.filter((r) => r.status === "ready").length,
        totalDuration: formattedData.reduce((sum, r) => sum + (r.duration_seconds || 0), 0),
        expiringToday,
      });
    } catch (error) {
      console.error("Error fetching recordings:", error);
      toast.error("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  useAdminRealtime(['stream_recordings'], () => fetchRecordings());

  const filteredRecordings = recordings.filter(rec =>
    rec.host_uid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rec.host_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rec.host?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "-";
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "recording":
        return <Badge className="bg-red-500 text-white animate-pulse">🔴 Recording</Badge>;
      case "processing":
        return <Badge className="bg-yellow-500 text-white">⏳ Processing</Badge>;
      case "ready":
        return <Badge className="bg-green-500 text-white">✓ Ready</Badge>;
      case "failed":
        return <Badge className="bg-red-600 text-white">✗ Failed</Badge>;
      case "expired":
        return <Badge className="bg-slate-500 text-white">Expired</Badge>;
      default:
        return <Badge className="bg-slate-500 text-white">{status}</Badge>;
    }
  };

  const getDaysUntilExpiry = (expiresAt: string) => {
    const days = differenceInDays(new Date(expiresAt), new Date());
    if (days <= 1) return <span className="text-red-400 font-medium">Less than 1 day</span>;
    if (days <= 3) return <span className="text-yellow-400 font-medium">{days} days</span>;
    return <span className="text-green-400">{days} days</span>;
  };

  const handlePlayRecording = (recording: Recording) => {
    if (!recording.recording_url) {
      toast.error("Recording URL not found");
      return;
    }
    setSelectedRecording(recording);
    setIsPlayerOpen(true);
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm("Do you want to delete this recording?")) return;

    try {
      const { error } = await supabase
        .from("stream_recordings")
        .update({ status: "deleted" })
        .eq("id", recordingId);

      if (error) throw error;
      toast.success("Recording deleted");
      fetchRecordings();
    } catch (error) {
      toast.error("Failed to delete recording");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Film className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              Live Recording Archive
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-1">Recordings stored for 15 days</p>
          </div>
          <Button onClick={fetchRecordings} variant="outline" className="border-white/30 text-white hover:bg-white/20 w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-slate-800 border-slate-700 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Film className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] sm:text-xs">Total Recordings</p>
                <p className="text-white font-bold text-lg sm:text-2xl">{stats.totalRecordings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] sm:text-xs">Ready</p>
                <p className="text-white font-bold text-lg sm:text-2xl">{stats.readyRecordings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] sm:text-xs">Total Duration</p>
                <p className="text-white font-bold text-lg sm:text-2xl">{formatDuration(stats.totalDuration)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700 shadow-md">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-red-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
              </div>
              <div>
                <p className="text-slate-400 text-[10px] sm:text-xs">Expiring Soon</p>
                <p className="text-white font-bold text-lg sm:text-2xl">{stats.expiringToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="bg-slate-800 border-slate-700 shadow-md">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by UID or host name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-600 text-white placeholder:text-slate-400 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 bg-slate-900 border-slate-600 text-white">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="all" className="text-white hover:bg-slate-700">All Recordings</SelectItem>
                <SelectItem value="recording" className="text-white hover:bg-slate-700">Recording</SelectItem>
                <SelectItem value="processing" className="text-white hover:bg-slate-700">Processing</SelectItem>
                <SelectItem value="ready" className="text-white hover:bg-slate-700">Ready</SelectItem>
                <SelectItem value="failed" className="text-white hover:bg-slate-700">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recordings List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredRecordings.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700 shadow-lg">
          <CardContent className="p-8 sm:p-12 text-center">
            <Film className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No recordings found</p>
            <p className="text-slate-500 text-sm mt-2">Search by UID or host name</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRecordings.map((recording) => (
            <motion.div
              key={recording.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-slate-800 border-slate-700 overflow-hidden hover:border-purple-500/50 transition-all shadow-lg">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Thumbnail / Preview */}
                    <div className="relative w-full sm:w-48 h-28 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0">
                      {recording.thumbnail_url ? (
                        <img
                          src={recording.thumbnail_url}
                          alt="Recording thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-10 h-10 text-slate-600" />
                        </div>
                      )}
                      {recording.status === "ready" && (
                        <button
                          onClick={() => handlePlayRecording(recording)}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                        >
                          <Play className="w-12 h-12 text-white" fill="white" />
                        </button>
                      )}
                      <div className="absolute top-2 left-2">
                        {getStatusBadge(recording.status)}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 border-2 border-purple-500/30">
                            <AvatarImage src={recording.host?.avatar_url || ""} />
                            <AvatarFallback className="bg-purple-900 text-purple-300">
                              {recording.host?.display_name?.charAt(0) || "H"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white font-medium">
                              {recording.host?.display_name || recording.host_name || "Unknown Host"}
                            </p>
                            <p className="text-slate-400 text-xs flex items-center gap-1">
                              <User className="w-3 h-3" />
                              UID: {recording.host_uid || recording.host?.app_uid || "-"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">
                            {format(new Date(recording.started_at), "dd MMM yyyy, hh:mm a")}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Expires: {getDaysUntilExpiry(recording.expires_at)}
                          </p>
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div className="bg-slate-900 rounded-lg p-2 text-center">
                          <Clock className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                          <p className="text-white text-sm font-medium">{formatDuration(recording.duration_seconds)}</p>
                          <p className="text-slate-500 text-[10px]">Duration</p>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-2 text-center">
                          <Users className="w-4 h-4 text-green-400 mx-auto mb-1" />
                          <p className="text-white text-sm font-medium">{recording.total_viewers}</p>
                          <p className="text-slate-500 text-[10px]">Viewers</p>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-2 text-center">
                          <Gift className="w-4 h-4 text-pink-400 mx-auto mb-1" />
                          <p className="text-white text-sm font-medium">{recording.total_gifts}</p>
                          <p className="text-slate-500 text-[10px]">Gifts</p>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-2 text-center">
                          <Diamond className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                          <p className="text-white text-sm font-medium">{recording.total_coins}</p>
                          <p className="text-slate-500 text-[10px]">Diamonds</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {recording.status === "ready" && recording.recording_url && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handlePlayRecording(recording)}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Watch
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-600 text-slate-300 hover:bg-slate-700"
                              onClick={() => window.open(recording.recording_url || "", "_blank")}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/20 ml-auto"
                          onClick={() => handleDeleteRecording(recording.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Video Player Dialog */}
      <Dialog open={isPlayerOpen} onOpenChange={setIsPlayerOpen}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              Recording - {selectedRecording?.host?.display_name || selectedRecording?.host_name}
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {selectedRecording?.recording_url ? (
              <video
                key={selectedRecording.id}
                src={selectedRecording.recording_url}
                controls
                autoPlay
                crossOrigin="anonymous"
                className="w-full h-full"
                onError={(e) => {
                  console.error("Video playback error:", e);
                  // Try opening in new tab as fallback
                  const videoEl = e.currentTarget;
                  if (videoEl.error) {
                    console.error("Video error code:", videoEl.error.code, "message:", videoEl.error.message);
                  }
                }}
              >
                Your browser does not support video playback
              </video>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                <Film className="w-12 h-12 text-slate-600" />
                <p>Recording URL not available</p>
                <p className="text-xs text-slate-600">Status: {selectedRecording?.status}</p>
              </div>
            )}
          </div>
          {selectedRecording && (
            <div className="flex items-center justify-between text-sm text-slate-400 mt-2">
              <span>
                Date: {format(new Date(selectedRecording.started_at), "dd MMM yyyy, hh:mm a")}
              </span>
              <span>
                Duration: {formatDuration(selectedRecording.duration_seconds)}
              </span>
              <span>
                Size: {formatFileSize(selectedRecording.file_size_bytes)}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
