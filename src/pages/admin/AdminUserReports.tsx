import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  ShieldAlert, Search, Clock, Eye, CheckCircle, XCircle, Ban, Users, AlertTriangle, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  sexual_content: { label: "Sexual Content", color: "bg-pink-600" },
  harassment_bullying: { label: "Harassment", color: "bg-red-600" },
  hate_speech: { label: "Hate Speech", color: "bg-orange-600" },
  violence_threats: { label: "Violence", color: "bg-red-700" },
  spam_scam: { label: "Spam/Scam", color: "bg-amber-600" },
  impersonation: { label: "Impersonation", color: "bg-purple-600" },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-600",
  reviewing: "bg-blue-600",
  resolved: "bg-green-600",
  dismissed: "bg-slate-600",
};

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_category: string;
  description: string | null;
  context_type: string;
  status: string;
  admin_notes: string | null;
  action_taken: string | null;
  created_at: string;
  reporter: { display_name: string; avatar_url: string | null } | null;
  reported_user: { display_name: string; avatar_url: string | null; is_host: boolean } | null;
}

export default function AdminUserReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");

  useAdminRealtime(['user_reports'], () => fetchReports());

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_reports")
        .select(`
          *,
          reporter:profiles!user_reports_reporter_id_fkey(display_name, avatar_url),
          reported_user:profiles!user_reports_reported_user_id_fkey(display_name, avatar_url, is_host)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const formatted = (data || []).map((r: any) => ({
        ...r,
        reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter,
        reported_user: Array.isArray(r.reported_user) ? r.reported_user[0] : r.reported_user,
      }));
      setReports(formatted as Report[]);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("user_reports")
        .update({
          status: newStatus,
          admin_notes: adminNotes || null,
          action_taken: actionTaken || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);
      if (error) throw error;
      toast.success(`Report ${newStatus}`);
      setSelectedReport(null);
      setAdminNotes("");
      setActionTaken("");
      fetchReports();
    } catch {
      toast.error("Failed to update report");
    }
  };

  const handleBlockUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: userId,
        _block: true,
      });
      if (error) throw error;
      toast.success("User blocked");
    } catch {
      toast.error("Failed to block user");
    }
  };

  const filtered = reports.filter((r) => {
    const matchSearch =
      r.reported_user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reporter?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchCategory = categoryFilter === "all" || r.report_category === categoryFilter;
    return matchSearch && matchStatus && matchCategory;
  });

  const stats = {
    total: reports.length,
    pending: reports.filter((r) => r.status === "pending").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg">
        <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
          <ShieldAlert className="w-6 h-6" />
          User Reports
        </h1>
        <p className="text-white/80 text-xs md:text-sm mt-1">Review and manage user reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/30 border-blue-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{stats.total}</p>
            <p className="text-xs text-blue-300">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/30 border-yellow-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            <p className="text-xs text-yellow-300">Pending</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/40 to-green-800/30 border-green-500/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
            <p className="text-xs text-green-300">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-600 text-white text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-36 bg-slate-900/50 border-slate-600 text-white text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewing">Reviewing</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-44 bg-slate-900/50 border-slate-600 text-white text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-white">
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card className="bg-slate-800/50 border-slate-700 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-800 hover:bg-slate-800">
                <TableHead className="text-slate-300 font-semibold">Reported User</TableHead>
                <TableHead className="text-slate-300 font-semibold">Category</TableHead>
                <TableHead className="text-slate-300 font-semibold hidden md:table-cell">Reporter</TableHead>
                <TableHead className="text-slate-300 font-semibold">Status</TableHead>
                <TableHead className="text-slate-300 font-semibold hidden md:table-cell">Time</TableHead>
                <TableHead className="text-slate-300 font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-10">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-10">No reports found</TableCell>
                </TableRow>
              ) : (
                filtered.map((report) => {
                  const cat = CATEGORY_LABELS[report.report_category] || { label: report.report_category, color: "bg-slate-600" };
                  return (
                    <TableRow key={report.id} className="border-slate-700 hover:bg-slate-700/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8 border border-red-500/30">
                            <AvatarImage src={report.reported_user?.avatar_url || ""} />
                            <AvatarFallback className="bg-red-600 text-white text-xs">
                              {report.reported_user?.display_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white text-sm font-medium">{report.reported_user?.display_name || "Unknown"}</p>
                            <Badge className={`text-[10px] ${report.reported_user?.is_host ? "bg-pink-600" : "bg-blue-600"} text-white`}>
                              {report.reported_user?.is_host ? "Host" : "User"}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${cat.color} text-white text-[10px]`}>{cat.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-slate-300 text-sm">{report.reporter?.display_name || "Unknown"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[report.status]} text-white text-[10px]`}>
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-slate-400 text-xs">
                          {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-600 text-white h-7 px-2"
                            onClick={() => {
                              setSelectedReport(report);
                              setAdminNotes(report.admin_notes || "");
                              setActionTaken(report.action_taken || "");
                            }}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          {report.status === "pending" && (
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white h-7 px-2"
                              onClick={() => handleBlockUser(report.reported_user_id)}
                            >
                              <Ban className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(o) => !o && setSelectedReport(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Report Details</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400">Reported User</p>
                  <p className="text-white font-medium">{selectedReport.reported_user?.display_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Reporter</p>
                  <p className="text-white font-medium">{selectedReport.reporter?.display_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Category</p>
                  <Badge className={`${CATEGORY_LABELS[selectedReport.report_category]?.color || "bg-slate-600"} text-white`}>
                    {CATEGORY_LABELS[selectedReport.report_category]?.label || selectedReport.report_category}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Context</p>
                  <p className="text-white text-sm">{selectedReport.context_type}</p>
                </div>
              </div>
              {selectedReport.description && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Description</p>
                  <p className="text-white/80 text-sm bg-slate-800 p-3 rounded-lg">{selectedReport.description}</p>
                </div>
              )}
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Admin notes..."
                className="bg-slate-800 border-slate-600 text-white"
              />
              <Input
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="Action taken (e.g., warned, banned)..."
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              className="border-slate-600 text-slate-300"
              onClick={() => selectedReport && handleUpdateStatus(selectedReport.id, "dismissed")}
            >
              <XCircle className="w-4 h-4 mr-1" /> Dismiss
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => selectedReport && handleUpdateStatus(selectedReport.id, "resolved")}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Resolve
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (selectedReport) {
                  handleBlockUser(selectedReport.reported_user_id);
                  handleUpdateStatus(selectedReport.id, "resolved");
                }
              }}
            >
              <Ban className="w-4 h-4 mr-1" /> Block & Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
