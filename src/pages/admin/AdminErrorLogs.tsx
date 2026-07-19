import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  RefreshCw,
  Search,
  Trash2,
  Eye,
  XCircle,
  Globe,
  MonitorSmartphone,
  Clock,
  Filter,
  Sparkles,
  Loader2,
  Wand2,
  Copy,
  Download,
  FileSpreadsheet,
  Play,
  Pause,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCsv, exportToPdf } from "@/utils/exportLogs";

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  page_url: string | null;
  page_path: string | null;
  component_name: string | null;
  user_id: string | null;
  user_agent: string | null;
  browser_info: any;
  created_at: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

/**
 * Admin Error Logs Page
 * Shows all system errors for monitoring and debugging
 */
export default function AdminErrorLogs() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterLevel, setFilterLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [filterResolved, setFilterResolved] = useState<string>("unresolved");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    unresolved: 0,
    todayErrors: 0,
    topPages: [] as { page: string; count: number }[],
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatAgo = (d: Date) => {
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };


  const LEVEL_MAP: Record<"info" | "warn" | "error", string[]> = {
    info: ["info"],
    warn: ["warning", "warn"],
    error: ["error", "render_error", "network_error", "unhandled_rejection"],
  };

  const fetchErrors = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filterType !== 'all') {
        query = query.eq('error_type', filterType);
      }

      if (filterLevel !== 'all') {
        query = query.in('error_type', LEVEL_MAP[filterLevel]);
      }

      if (filterResolved === 'resolved') {
        query = query.eq('is_resolved', true);
      } else if (filterResolved === 'unresolved') {
        query = query.eq('is_resolved', false);
      }

      if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte('created_at', end.toISOString());
      }

      if (searchQuery) {
        query = query.or(`error_message.ilike.%${searchQuery}%,page_path.ilike.%${searchQuery}%,component_name.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setErrors(data || []);

      // Calculate GLOBAL stats via exact count queries (not limited to fetched page)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalRes, unresolvedRes, todayRes, topPagesRes] = await Promise.all([
        supabase.from('system_error_logs').select('id', { count: 'exact', head: true }),
        supabase.from('system_error_logs').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
        supabase.from('system_error_logs').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
        supabase.from('system_error_logs').select('page_path').limit(1000).order('created_at', { ascending: false }),
      ]);

      const pageGroups: Record<string, number> = {};
      (topPagesRes.data || []).forEach((e: any) => {
        const page = e.page_path || 'Unknown';
        pageGroups[page] = (pageGroups[page] || 0) + 1;
      });
      const topPages = Object.entries(pageGroups)
        .map(([page, count]) => ({ page, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({
        topPages,
      });

    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to load error logs');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    fetchErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterLevel, filterResolved, searchQuery, dateFrom, dateTo]);

  useAdminRealtime(['system_error_logs'], () => fetchErrors());

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchErrors(), refreshInterval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval, filterType, filterLevel, filterResolved, searchQuery, dateFrom, dateTo]);

  const handleResolve = async (errorId: string) => {
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      
      await supabase
        .from('system_error_logs')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: resolutionNotes,
        })
        .eq('id', errorId);

      toast.success('Error marked as resolved');
      setSelectedError(null);
      setResolutionNotes("");
      fetchErrors();
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (errorId: string) => {
    if (!confirm('Delete this error log?')) return;
    
    try {
      await supabase.from('system_error_logs').delete().eq('id', errorId);
      toast.success('Error log deleted');
      fetchErrors();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleClearResolved = async () => {
    if (!confirm('Delete all resolved errors?')) return;
    
    try {
      await supabase.from('system_error_logs').delete().eq('is_resolved', true);
      toast.success('Resolved errors deleted');
      fetchErrors();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleExport = (fmt: "csv" | "pdf") => {
    if (!errors.length) {
      toast.error("No errors to export");
      return;
    }
    const rows = errors.map((e) => ({
      Time: new Date(e.created_at).toLocaleString(),
      Type: e.error_type,
      Message: e.error_message,
      Page: e.page_path || "",
      Component: e.component_name || "",
      User_ID: e.user_id || "",
      Resolved: e.is_resolved ? "Yes" : "No",
      Resolution_Notes: e.resolution_notes || "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") exportToCsv(`error-logs-${stamp}.csv`, rows);
    else exportToPdf(`error-logs-${stamp}.pdf`, "System Error Logs", rows);
    toast.success(`Exported ${rows.length} errors as ${fmt.toUpperCase()}`);
  };

  // AI Error Analysis Function
  const handleAIAnalysis = async () => {
    if (!selectedError) return;
    
    setAnalyzingAI(true);
    setAiAnalysis("");
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-error', {
        body: {
          errorMessage: selectedError.error_message,
          errorStack: selectedError.error_stack,
          pagePath: selectedError.page_path,
          componentName: selectedError.component_name,
          browserInfo: selectedError.browser_info,
        }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setAiAnalysis(data?.analysis || "Analysis could not be completed.");
      toast.success("AI analysis complete!");
    } catch (error: any) {
      console.error('AI analysis error:', error);
      toast.error(error.message || "AI analysis failed");
    } finally {
      setAnalyzingAI(false);
    }
  };

  // Copy AI analysis to resolution notes
  const copyToResolution = () => {
    if (aiAnalysis) {
      setResolutionNotes(aiAnalysis);
      toast.success("Copied to notes");
    }
  };

  const getErrorTypeIcon = (type: string) => {
    switch (type) {
      case 'render_error':
        return <Bug className="w-4 h-4 text-purple-400" />;
      case 'network_error':
        return <Globe className="w-4 h-4 text-blue-400" />;
      case 'unhandled_rejection':
        return <XCircle className="w-4 h-4 text-orange-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
  };

  const getErrorTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      render_error: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      network_error: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      unhandled_rejection: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    return colors[type] || colors.error;
  };

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="w-7 h-7 text-red-400" />
            System Error Logs
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-sm">All application errors are recorded here</span>
            {autoRefresh ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live · {refreshInterval}s
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                Paused
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-slate-600" title={lastRefresh.toLocaleString()}>
              <Clock className="w-3 h-3" />
              Updated {formatAgo(lastRefresh)}
            </span>
          </p>

        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAutoRefresh((v) => !v)}>
            {autoRefresh ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {autoRefresh ? "Pause" : "Resume"}
          </Button>
          <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="5">5s</SelectItem>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border-slate-200">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <Bug className="w-4 h-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={handleClearResolved}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Resolved
          </Button>
          <Button onClick={fetchErrors} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Errors</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Bug className="w-8 h-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-900/20 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-300">Unresolved</p>
                <p className="text-2xl font-bold text-red-400">{stats.unresolved}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-900/20 border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-300">Today's Errors</p>
                <p className="text-2xl font-bold text-orange-400">{stats.todayErrors}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Problem Pages</p>
              <div className="space-y-1">
                {stats.topPages.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="truncate max-w-[150px]">{p.page}</span>
                    <Badge variant="outline" className="text-xs">{p.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search error message or page..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50"
              />
            </div>
            
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px] bg-slate-50">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Error Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="render_error">Render Error</SelectItem>
                <SelectItem value="network_error">Network Error</SelectItem>
                <SelectItem value="unhandled_rejection">Unhandled Rejection</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterLevel} onValueChange={(v) => setFilterLevel(v as any)}>
              <SelectTrigger className="w-[150px] bg-slate-50">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterResolved} onValueChange={setFilterResolved}>
              <SelectTrigger className="w-[150px] bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">All</SelectItem>
                 <SelectItem value="unresolved">Unresolved</SelectItem>
                 <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[170px] bg-slate-50"
              aria-label="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[170px] bg-slate-50"
              aria-label="To date"
            />
            {(dateFrom || dateTo || filterLevel !== "all" || filterType !== "all" || searchQuery) && (
              <Button
                variant="outline"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setFilterLevel("all");
                  setFilterType("all");
                  setSearchQuery("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error List */}
      <Card className="bg-white border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Error List</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead className="w-[50px]">Type</TableHead>
                   <TableHead>Error Message</TableHead>
                   <TableHead className="w-[150px]">Page</TableHead>
                   <TableHead className="w-[150px]">Time</TableHead>
                   <TableHead className="w-[100px]">Status</TableHead>
                   <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                       Loading...
                    </TableCell>
                  </TableRow>
                ) : errors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-400" />
                      No errors found! 🎉
                    </TableCell>
                  </TableRow>
                ) : (
                  errors.map((error) => (
                    <TableRow 
                      key={error.id}
                      className={error.is_resolved ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getErrorTypeIcon(error.error_type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="text-sm font-medium truncate">
                            {error.error_message.slice(0, 80)}...
                          </p>
                          {error.component_name && (
                            <p className="text-xs text-muted-foreground">
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs truncate max-w-[140px] block">
                          {error.page_path || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(error.created_at), 'dd/MM HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={error.is_resolved 
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                          }
                        >
                          {error.is_resolved ? 'Resolved' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAiAnalysis("");
                              setResolutionNotes("");
                              setSelectedError(error);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-400"
                            onClick={() => handleDelete(error.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog 
        open={!!selectedError} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedError(null);
            setAiAnalysis("");
            setResolutionNotes("");
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {selectedError && getErrorTypeIcon(selectedError.error_type)}
              Error Details
            </DialogTitle>
          </DialogHeader>

          {selectedError && (
            <ScrollArea className="flex-1 pr-4 min-h-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Type</label>
                    <Badge className={getErrorTypeBadge(selectedError.error_type)}>
                      {selectedError.error_type}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Time</label>
                    <p className="text-sm">
                      {format(new Date(selectedError.created_at), 'dd/MM/yyyy HH:mm:ss')}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Page URL</label>
                  <p className="text-sm font-mono bg-slate-50 p-2 rounded text-xs break-all">
                    {selectedError.page_url || 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Error Message</label>
                  <p className="text-sm bg-red-900/20 border border-red-500/30 p-3 rounded">
                    {selectedError.error_message}
                  </p>
                </div>

                {selectedError.error_stack && (
                  <div>
                    <label className="text-xs text-muted-foreground">Stack Trace</label>
                    <pre className="text-xs bg-slate-50 p-3 rounded overflow-x-auto max-h-[200px]">
                      {selectedError.error_stack}
                    </pre>
                  </div>
                )}

                {selectedError.browser_info && (
                  <div>
                    <label className="text-xs text-muted-foreground">Browser Info</label>
                    <div className="bg-slate-50 p-3 rounded text-xs space-y-1">
                      <p><MonitorSmartphone className="w-3 h-3 inline mr-2" />
                        {selectedError.browser_info.platform}
                      </p>
                      <p className="truncate">
                        {selectedError.browser_info.userAgent}
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Analysis Section */}
                {!selectedError.is_resolved && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Wand2 className="w-3 h-3 text-purple-400" />
                        AI Analysis
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAIAnalysis}
                        disabled={analyzingAI}
                        className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30"
                      >
                        {analyzingAI ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 mr-1 text-purple-400" />
                            Fix with AI
                          </>
                        )}
                      </Button>
                    </div>

                    {aiAnalysis && (
                      <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-purple-300">AI Solution Suggestion</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={copyToResolution}
                            className="text-xs h-7"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy to Notes
                          </Button>
                        </div>
                        <div className="prose prose-sm prose-invert max-w-none">
                          <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                            {aiAnalysis}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!selectedError.is_resolved && (
                  <div>
                     <label className="text-xs text-muted-foreground">Resolution Notes</label>
                     <Textarea
                       placeholder="Describe how you resolved this..."
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="bg-slate-50"
                    />
                  </div>
                )}

                {selectedError.is_resolved && selectedError.resolution_notes && (
                  <div>
                    <label className="text-xs text-muted-foreground">Resolution Notes</label>
                    <p className="bg-green-900/20 border border-green-500/30 p-3 rounded text-sm whitespace-pre-wrap">
                      {selectedError.resolution_notes}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-shrink-0 pt-4 border-t border-border mt-4">
            {selectedError && !selectedError.is_resolved && (
              <Button 
                onClick={() => handleResolve(selectedError.id)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark as Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
