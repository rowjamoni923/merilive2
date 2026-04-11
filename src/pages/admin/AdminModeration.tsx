import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Ban,
  Eye,
  Phone,
  Clock,
  User,
  Settings,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { saveAppSetting } from "@/utils/adminSettingsStorage";

interface ModerationLog {
  id: string;
  user_id: string;
  violation_type: string;
  detected_content: string | null;
  action_taken: string;
  is_auto_action: boolean;
  created_at: string;
  notes: string | null;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    is_blocked: boolean | null;
  };
}

interface ModerationSettings {
  phone_detection_enabled: boolean;
  auto_ban_phone_threshold: number;
  profile_slideshow_interval: number;
  max_poster_images: number;
}

export default function AdminModeration() {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settings, setSettings] = useState<ModerationSettings>({
    phone_detection_enabled: true,
    auto_ban_phone_threshold: 3,
    profile_slideshow_interval: 5,
    max_poster_images: 5
  });
  const [savingSettings, setSavingSettings] = useState(false);
  
  const pageSize = 20;

  useEffect(() => {
    fetchLogs();
    fetchSettings();
  }, [currentPage, filterType]);

  useAdminRealtime(['chat_moderation_logs'], () => fetchLogs());

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "phone_detection_enabled",
        "auto_ban_phone_threshold",
        "profile_slideshow_interval",
        "max_poster_images"
      ]);

    if (data) {
      const settingsMap: any = {};
      data.forEach((item: any) => {
        if (item.setting_key === "phone_detection_enabled") {
          settingsMap.phone_detection_enabled = item.setting_value === "true";
        } else {
          settingsMap[item.setting_key] = parseInt(item.setting_value as string) || 0;
        }
      });
      setSettings(prev => ({ ...prev, ...settingsMap }));
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("chat_moderation_logs")
        .select("*", { count: "exact" });

      if (filterType === "phone_number") {
        query = query.eq("violation_type", "phone_number");
      } else if (filterType === "auto_ban") {
        query = query.eq("action_taken", "auto_ban");
      } else if (filterType === "warning") {
        query = query.eq("action_taken", "warning");
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Fetch user profiles for logs
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(l => l.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_blocked")
          .in("id", userIds);

        const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const logsWithUsers = data.map(log => ({
          ...log,
          user: profilesMap.get(log.user_id)
        }));
        setLogs(logsWithUsers);
      } else {
        setLogs([]);
      }
      
      setTotalLogs(count || 0);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const updates = [
        { setting_key: "phone_detection_enabled", setting_value: settings.phone_detection_enabled.toString() },
        { setting_key: "auto_ban_phone_threshold", setting_value: settings.auto_ban_phone_threshold.toString() },
        { setting_key: "profile_slideshow_interval", setting_value: settings.profile_slideshow_interval.toString() },
        { setting_key: "max_poster_images", setting_value: settings.max_poster_images.toString() }
      ];

      for (const update of updates) {
        await saveAppSetting(update.setting_key, update.setting_value, `${update.setting_key} settings`);
      }

      toast.success("Settings saved");
      setShowSettingsDialog(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          is_blocked: false, 
          blocked_at: null, 
          blocked_reason: null,
          phone_violation_count: 0
        })
        .eq("id", userId);

      if (error) throw error;
      toast.success("User unbanned");
      fetchLogs();
    } catch (error) {
      console.error("Error unbanning user:", error);
      toast.error("Failed to unban user");
    }
  };

  const totalPages = Math.ceil(totalLogs / pageSize);

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-red-50/50 to-orange-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div>
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-slate-800 via-red-700 to-slate-800 bg-clip-text text-transparent flex items-center gap-2">
            <Shield className="w-5 h-5 md:w-7 md:h-7 text-red-500" />
            Moderation Management
          </h1>
          <p className="text-slate-600 text-sm">Phone number detection and auto-ban system</p>
        </div>
        <Button
          onClick={() => setShowSettingsDialog(true)}
          className="bg-gradient-to-r from-purple-500 to-pink-500 w-full md:w-auto"
          size="sm"
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-gradient-to-br from-red-500 to-orange-500 text-white border-0">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <AlertTriangle className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
              <div>
                <p className="text-xl md:text-2xl font-bold">{totalLogs}</p>
                <p className="text-[10px] md:text-xs opacity-80">Total Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-pink-500 text-white border-0">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <Phone className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
              <div>
                <p className="text-xl md:text-2xl font-bold">
                  {logs.filter(l => l.violation_type === "phone_number").length}
                </p>
                <p className="text-[10px] md:text-xs opacity-80">Phone Detection</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white border-0">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <Ban className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
              <div>
                <p className="text-xl md:text-2xl font-bold">
                  {logs.filter(l => l.action_taken === "auto_ban").length}
                </p>
                <p className="text-[10px] md:text-xs opacity-80">Auto-Ban</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-emerald-500 text-white border-0">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <CheckCircle className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
              <div>
                <p className="text-xl md:text-2xl font-bold">
                  {settings.phone_detection_enabled ? "ON" : "OFF"}
                </p>
                <p className="text-[10px] md:text-xs opacity-80">AI Detection</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-slate-200"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-48 bg-white border-slate-200">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Violations</SelectItem>
                <SelectItem value="phone_number">Phone Number</SelectItem>
                <SelectItem value="auto_ban">Auto-Ban</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="bg-white border-slate-200 shadow-xl overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Shield className="w-12 h-12 mb-4" />
              <p>No moderation logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-red-50/30">
                    <th className="text-left p-4 text-slate-600 font-semibold">User</th>
                    <th className="text-left p-4 text-slate-600 font-semibold hidden md:table-cell">Violation</th>
                    <th className="text-left p-4 text-slate-600 font-semibold hidden lg:table-cell">Detected Content</th>
                    <th className="text-left p-4 text-slate-600 font-semibold">Action</th>
                    <th className="text-left p-4 text-slate-600 font-semibold hidden xl:table-cell">Time</th>
                    <th className="text-right p-4 text-slate-600 font-semibold">Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-slate-100 hover:bg-red-50/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 border-2 border-slate-200">
                            <AvatarImage src={log.user?.avatar_url || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-red-400 to-orange-500 text-white">
                              {log.user?.display_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-slate-800 flex items-center gap-2">
                              {log.user?.display_name || "Unknown"}
                              {log.user?.is_blocked && (
                                <Badge className="bg-red-100 text-red-600 text-xs">Banned</Badge>
                              )}
                            </p>
                            {log.user?.app_uid && (
                              <p className="text-xs text-slate-500">{log.user.app_uid}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <Badge className="bg-orange-100 text-orange-600">
                          <Phone className="w-3 h-3 mr-1" />
                          {log.violation_type}
                        </Badge>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <p className="text-sm text-slate-600 max-w-xs truncate">
                          {log.detected_content || "-"}
                        </p>
                      </td>
                      <td className="p-4">
                        <Badge className={
                          log.action_taken === "auto_ban" 
                            ? "bg-red-100 text-red-600" 
                            : "bg-yellow-100 text-yellow-600"
                        }>
                          {log.action_taken === "auto_ban" ? (
                            <>
                              <Ban className="w-3 h-3 mr-1" />
                              Auto-Ban
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Warning
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className="p-4 hidden xl:table-cell text-slate-500 text-sm">
                        {new Date(log.created_at).toLocaleString("en-US")}
                      </td>
                      <td className="p-4 text-right">
                        {log.user?.is_blocked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnbanUser(log.user_id)}
                            className="text-green-600 hover:bg-green-50"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Unban
                          </Button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-slate-600 px-4">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-500" />
              Moderation Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Phone Detection Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">AI Phone Number Detection</Label>
                <p className="text-sm text-muted-foreground">Automatically detect phone numbers in chat</p>
              </div>
              <Switch
                checked={settings.phone_detection_enabled}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, phone_detection_enabled: checked }))
                }
              />
            </div>

            {/* Auto Ban Threshold */}
            <div>
              <Label className="text-base font-medium">Auto-Ban Threshold</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Number of violations before automatic ban
              </p>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.auto_ban_phone_threshold}
                onChange={(e) => 
                  setSettings(prev => ({ 
                    ...prev, 
                    auto_ban_phone_threshold: parseInt(e.target.value) || 3 
                  }))
                }
                className="w-24"
              />
            </div>

            {/* Slideshow Interval */}
            <div>
              <Label className="text-base font-medium">Profile Slideshow Interval (seconds)</Label>
              <p className="text-sm text-muted-foreground mb-2">
                How often profile poster images change
              </p>
              <Input
                type="number"
                min={1}
                max={30}
                value={settings.profile_slideshow_interval}
                onChange={(e) => 
                  setSettings(prev => ({ 
                    ...prev, 
                    profile_slideshow_interval: parseInt(e.target.value) || 5 
                  }))
                }
                className="w-24"
              />
            </div>

            {/* Max Poster Images */}
            <div>
              <Label className="text-base font-medium">Max Poster Images</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Maximum number of poster images a user can upload
              </p>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.max_poster_images}
                onChange={(e) => 
                  setSettings(prev => ({ 
                    ...prev, 
                    max_poster_images: parseInt(e.target.value) || 5 
                  }))
                }
                className="w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSettingsDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveSettings}
              disabled={savingSettings}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
