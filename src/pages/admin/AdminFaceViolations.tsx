import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getCurrentAdminId } from "@/utils/adminSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  AlertTriangle, Eye, EyeOff, Ban, CheckCircle, RefreshCw,
  Clock, Video, Shield, Search, Filter
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

interface FaceViolation {
  id: string;
  host_id: string;
  stream_id: string | null;
  violation_type: string;
  detected_at: string;
  auto_closed: boolean;
  countdown_duration: number;
  notes: string | null;
  admin_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  action_taken: string | null;
  created_at: string;
  host_name?: string;
  host_avatar?: string;
  host_uid?: string;
}

const AdminFaceViolations = () => {
  const [violations, setViolations] = useState<FaceViolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "unreviewed" | "reviewed">("all");

  const fetchViolations = async () => {
    setLoading(true);
    try {
      const adminId = getCurrentAdminId();
      if (!adminId) { setViolations([]); return; }
      const { data, error } = await supabase.rpc("admin_list_face_violations", {
        _admin_id: adminId,
        _limit: 200,
      });
      if (error) throw error;
      const enriched = (data || []).map((v: any) => ({
        ...v,
        host_name: v.display_name || 'Unknown',
        host_avatar: null,
        host_uid: v.app_uid || null,
      }));
      setViolations(enriched as FaceViolation[]);
    } catch (err) {
      console.error('Error fetching violations:', err);
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  useAdminRealtime(['live_face_violations'], fetchViolations);

  const handleBanHost = async (violation: FaceViolation) => {
    try {
      await supabase
        .from('live_face_violations')
        .update({
          admin_reviewed: true,
          reviewed_at: new Date().toISOString(),
          action_taken: 'live_ban',
        })
        .eq('id', violation.id);

      await supabase.from('live_violations').insert({
        user_id: violation.host_id,
        violation_type: 'face_not_detected',
        action_taken: 'live_ban',
        ban_duration_hours: 24,
        notes: 'Auto-banned for 24 hours due to face not detected',
        created_at: new Date().toISOString(),
      });

      await supabase.from('admin_logs').insert({
        action_type: 'live_ban',
        target_type: 'user',
        target_id: violation.host_id,
        details: {
          reason: 'Face not detected during live stream',
          violation_id: violation.id,
          stream_id: violation.stream_id,
          ban_duration: '24h',
        },
      });

      toast.success('Host banned from live for 24 hours');
      fetchViolations();
    } catch (err) {
      console.error('Ban error:', err);
      toast.error('Failed to ban host');
    }
  };

  const handleMarkReviewed = async (violation: FaceViolation) => {
    try {
      await supabase
        .from('live_face_violations')
        .update({
          admin_reviewed: true,
          reviewed_at: new Date().toISOString(),
          action_taken: 'warning',
        })
        .eq('id', violation.id);

      toast.success('Review completed');
      fetchViolations();
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const filtered = violations.filter(v => {
    if (filterType === "unreviewed" && v.admin_reviewed) return false;
    if (filterType === "reviewed" && !v.admin_reviewed) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        v.host_name?.toLowerCase().includes(q) ||
        v.host_uid?.toLowerCase().includes(q) ||
        v.host_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const unreviewedCount = violations.filter(v => !v.admin_reviewed).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/20 rounded-xl">
            <EyeOff className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Face Detection Violations</h1>
            <p className="text-muted-foreground text-sm">Records of face not detected during live streams</p>
          </div>
          {unreviewedCount > 0 && (
            <Badge variant="destructive" className="animate-pulse text-lg px-3 py-1">
              {unreviewedCount} New
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchViolations} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by host name or UID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "unreviewed", "reviewed"] as const).map(type => (
            <Button
              key={type}
              variant={filterType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(type)}
              className={filterType === type && type === "unreviewed" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {type === "all" ? "All" : type === "unreviewed" ? `Pending (${unreviewedCount})` : "Reviewed"}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Eye className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No violations found</p>
            </div>
          ) : (
            filtered.map(v => (
              <div
                key={v.id}
                className={`rounded-xl border p-4 transition-all ${
                  !v.admin_reviewed
                    ? 'border-red-500/50 bg-red-500/5 shadow-red-500/10 shadow-lg'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-4">
                  {!v.admin_reviewed && (
                    <div className="mt-1">
                      <AlertTriangle className="w-6 h-6 text-red-500 animate-pulse" />
                    </div>
                  )}

                  <Avatar className="w-12 h-12 border-2 border-red-400/30">
                    <AvatarImage src={v.host_avatar || undefined} />
                    <AvatarFallback>{v.host_name?.charAt(0) || 'H'}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{v.host_name}</span>
                      {v.host_uid && (
                        <Badge variant="outline" className="text-xs">UID: {v.host_uid}</Badge>
                      )}
                      <Badge
                        variant={v.auto_closed ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {v.auto_closed ? '🔴 Auto-Closed' : '⚠️ Warning'}
                      </Badge>
                      {v.action_taken && (
                        <Badge variant="outline" className="text-xs">
                          {v.action_taken === 'live_ban' ? '🚫 Banned' : '✅ Warning'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(v.created_at), 'dd MMM yyyy, hh:mm a')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Video className="w-3 h-3" />
                        {v.violation_type === 'no_face' ? 'No Face' : v.violation_type === 'dark_camera' ? 'Dark Camera' : v.violation_type}
                      </span>
                    </div>

                    {v.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{v.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {!v.admin_reviewed ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleBanHost(v)}
                          className="text-xs"
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" />
                          Ban
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkReviewed(v)}
                          className="text-xs"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Review
                        </Button>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Shield className="w-3 h-3 mr-1" />
                        Reviewed
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AdminFaceViolations;
