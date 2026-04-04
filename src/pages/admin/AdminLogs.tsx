import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  User,
  Building2,
  Settings,
  Ban,
  CheckCircle,
  Clock,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { bn } from "date-fns/locale";

interface AdminLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  admin?: {
    display_name: string;
    avatar_url: string | null;
  };
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  useAdminRealtime(['admin_logs'], () => fetchLogs());

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionFilter !== "all") {
        query = query.eq("action_type", actionFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch admin profiles separately
      const adminIds = [...new Set((data || []).map(log => log.admin_id).filter(Boolean))];
      
      let adminProfiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
      
      if (adminIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", adminIds);
        
        if (profiles) {
          adminProfiles = profiles.reduce((acc, profile) => {
            acc[profile.id] = { display_name: profile.display_name, avatar_url: profile.avatar_url };
            return acc;
          }, {} as Record<string, { display_name: string; avatar_url: string | null }>);
        }
      }
      
      const formattedLogs = (data || []).map(log => ({
        ...log,
        admin: log.admin_id ? adminProfiles[log.admin_id] : null
      })) as AdminLog[];
      
      setLogs(formattedLogs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    if (actionType.includes("block")) return <Ban className="w-4 h-4 text-red-400" />;
    if (actionType.includes("unblock")) return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (actionType.includes("user")) return <User className="w-4 h-4 text-blue-400" />;
    if (actionType.includes("agency")) return <Building2 className="w-4 h-4 text-purple-400" />;
    return <Settings className="w-4 h-4 text-gray-400" />;
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      block_user: "Block User",
      unblock_user: "Unblock User",
      block_agency: "Block Agency",
      unblock_agency: "Unblock Agency",
      update_settings: "Update Settings",
      create_gift: "Create Gift",
      update_gift: "Update Gift",
      delete_gift: "Delete Gift",
      verify_host: "Verify Host",
      approve_host: "Approve Host",
      reject_host: "Reject Host"
    };
    return labels[actionType] || actionType;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes("block")) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (actionType.includes("unblock") || actionType.includes("approve")) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (actionType.includes("delete") || actionType.includes("reject")) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (actionType.includes("create")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  const filteredLogs = logs.filter(log =>
    log.action_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.admin?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.target_id?.includes(searchQuery)
  );

  const actionTypes = [
    { value: "all", label: "All Actions" },
    { value: "block_user", label: "Block User" },
    { value: "unblock_user", label: "Unblock User" },
    { value: "block_agency", label: "Block Agency" },
    { value: "unblock_agency", label: "Unblock Agency" },
    { value: "update_settings", label: "Update Settings" }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-2xl p-6 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7" />
            Activity Log
          </h1>
          <p className="text-white/80 text-sm mt-1">All admin activities</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800/50 border-slate-700 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by admin name or target ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-48 bg-slate-900/50 border-slate-600 text-slate-200">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Action Filter" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {actionTypes.map(type => (
                  <SelectItem key={type.value} value={type.value} className="text-slate-200 focus:bg-slate-700 focus:text-white">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card className="bg-slate-800/50 border-slate-700 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No logs found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredLogs.map((log) => (
                <Collapsible
                  key={log.id}
                  open={expandedLog === log.id}
                  onOpenChange={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-4 p-4 hover:bg-slate-700/50 transition-colors">
                      {/* Action Icon */}
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                        {getActionIcon(log.action_type)}
                      </div>

                      {/* Action Info */}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getActionColor(log.action_type)}>
                            {getActionLabel(log.action_type)}
                          </Badge>
                          {log.target_type && (
                            <span className="text-slate-400 text-xs">
                              ({log.target_type})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={log.admin?.avatar_url || ""} />
                            <AvatarFallback className="bg-pink-600 text-white text-xs">
                              {log.admin?.display_name?.charAt(0) || "A"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{log.admin?.display_name || "Unknown Admin"}</span>
                        </div>
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-slate-400 text-sm">
                            <Clock className="w-4 h-4" />
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: bn })}
                          </div>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedLog === log.id ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 pl-18 space-y-3">
                      {log.target_id && (
                        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                          <p className="text-slate-400 text-xs mb-1">Target ID</p>
                          <p className="text-slate-200 font-mono text-sm">{log.target_id}</p>
                        </div>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                          <p className="text-slate-400 text-xs mb-1">Details</p>
                          <pre className="text-slate-200 text-sm overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.ip_address && (
                        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                          <p className="text-slate-400 text-xs mb-1">IP Address</p>
                          <p className="text-slate-200 font-mono text-sm">{log.ip_address}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
