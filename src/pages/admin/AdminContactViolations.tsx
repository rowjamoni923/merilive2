/**
 * Admin Contact Violations Management
 * =====================================================
 * Monitors and manages host contact sharing violations
 * - View all detected violations (auto & manual)
 * - Search violations by user or content
 * - Manual ban functionality
 * - Progressive penalty tracking
 * =====================================================
 */

import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Search, 
  ShieldAlert, 
  Ban, 
  Phone, 
  MessageSquare, 
  Video, 
  PhoneCall,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  Trash2,
  MoreVertical,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";
import { bn } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Violation {
  id: string;
  host_id: string;
  violation_number: number;
  violation_type: string;
  detected_content: string;
  detected_pattern: string;
  source_type: string;
  source_id: string | null;
  beans_deducted: number;
  is_auto_detected: boolean;
  is_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  host?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_blocked: boolean;
    beans: number;
  };
}

interface PenaltyTier {
  violation_number: number;
  penalty_type: string;
  beans_amount: number;
  description: string;
}

const sourceTypeIcons: Record<string, React.ReactNode> = {
  chat: <MessageSquare className="w-4 h-4" />,
  live_stream: <Video className="w-4 h-4" />,
  private_call: <PhoneCall className="w-4 h-4" />,
  private_message: <MessageSquare className="w-4 h-4" />,
};

const sourceTypeLabels: Record<string, string> = {
  chat: "Party Chat",
  live_stream: "Live Stream",
  private_call: "Private Call",
  private_message: "Private Message",
};

const patternLabels: Record<string, string> = {
  phone_number: "📱 Phone Number",
  whatsapp: "💬 WhatsApp",
  imo: "📞 IMO",
  facebook: "👤 Facebook",
  messenger: "💬 Messenger",
  instagram: "📷 Instagram",
  tiktok: "🎵 TikTok",
  telegram: "✈️ Telegram",
  email: "📧 Email",
  contact_intent: "🔗 Contact Intent",
};

interface AdminContactViolationsProps {
  onViewChat?: (user: { id: string; display_name: string | null; avatar_url: string | null; app_uid: string | null }) => void;
}

export default function AdminContactViolations({ onViewChat }: AdminContactViolationsProps = {}) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [penaltyTiers, setPenaltyTiers] = useState<PenaltyTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    banned: 0,
    thisWeek: 0,
  });
  
  // Dialog states
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banningHost, setBanningHost] = useState<string | null>(null);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const { data: violationsData, error: violationsError } = await supabase
        .from("host_contact_violations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (violationsError) throw violationsError;
      
      const violations = violationsData as any[] || [];
      
      // Fetch host profiles for these violations
      const hostIds = [...new Set(violations.map(v => v.host_id))];
      const { data: hosts } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_blocked, beans")
        .in("id", hostIds);
      
      const hostsMap = new Map((hosts || []).map((h: any) => [h.id, h]));
      
      // Merge host data
      const violationsWithHosts: Violation[] = violations.map(v => ({
        ...v,
        host: hostsMap.get(v.host_id) || null,
      }));

      setViolations(violationsWithHosts);

      // Fetch accurate global stats using head queries
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [totalRes, thisWeekRes] = await Promise.all([
        supabase.from("host_contact_violations").select("*", { count: "exact", head: true }),
        supabase.from("host_contact_violations").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
      ]);

      // For pending/banned we still derive from local data since they require join logic
      const pending = violationsWithHosts.filter(v => !v.is_reviewed && !v.host?.is_blocked).length;
      const banned = violationsWithHosts.filter(v => v.host?.is_blocked).length;

      setStats({ total: totalRes.count || 0, pending, banned, thisWeek: thisWeekRes.count || 0 });
    } catch (error) {
      console.error("Error fetching violations:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPenaltyTiers = async () => {
    const { data } = await supabase
      .from("violation_penalty_tiers")
      .select("*")
      .order("violation_number");
    
    if (data) {
      setPenaltyTiers(data as PenaltyTier[]);
    }
  };


  useAdminRealtime(['host_contact_violations'], () => fetchViolations());

  // Filter violations based on search and tab
  const filteredViolations = violations.filter(v => {
    const matchesSearch = searchQuery === "" || 
      v.host?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.host?.id?.includes(searchQuery) ||
      v.detected_content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.detected_pattern.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab = 
      activeTab === "all" ||
      (activeTab === "pending" && !v.is_reviewed && !v.host?.is_blocked) ||
      (activeTab === "banned" && v.host?.is_blocked) ||
      (activeTab === "reviewed" && v.is_reviewed);

    return matchesSearch && matchesTab;
  });

  // Ban a host manually
  const handleBanHost = async (hostId: string) => {
    setBanningHost(hostId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: true,
          blocked_reason: "Manual ban: Contact sharing violation",
          blocked_at: new Date().toISOString(),
        })
        .eq("id", hostId);

      if (error) throw error;

      toast.success("Host banned successfully");
      fetchViolations();
    } catch (error) {
      console.error("Ban error:", error);
      toast.error("Failed to ban host");
    } finally {
      setBanningHost(null);
      setShowBanDialog(false);
    }
  };

  // Mark violation as reviewed
  const handleMarkReviewed = async (violationId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("host_contact_violations")
        .update({
          is_reviewed: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", violationId);

      if (error) throw error;
      toast.success("Review complete");
      fetchViolations();
    } catch (error) {
      console.error("Review error:", error);
      toast.error("Failed to review");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Violations</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4 text-center">
            <Ban className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p className="text-2xl font-bold text-foreground">{stats.banned}</p>
            <p className="text-xs text-muted-foreground">Banned Hosts</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <Phone className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-2xl font-bold text-foreground">{stats.thisWeek}</p>
            <p className="text-xs text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Penalty Tiers Info */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Progressive Penalty System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {penaltyTiers.map((tier) => (
              <Badge 
                key={tier.violation_number}
                variant={tier.penalty_type === "account_ban" ? "destructive" : "secondary"}
                className="text-xs"
              >
                #{tier.violation_number}: {tier.penalty_type === "account_ban" 
                  ? "🚫 Account Ban" 
                  : `${tier.beans_amount.toLocaleString()} Beans`}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, UID, or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={fetchViolations} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs and Violations List */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="banned">Banned ({stats.banned})</TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-4">
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredViolations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No violations found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredViolations.map((violation) => (
                    <ViolationCard
                      key={violation.id}
                      violation={violation}
                      onView={() => setSelectedViolation(violation)}
                      onBan={() => {
                        setSelectedViolation(violation);
                        setShowBanDialog(true);
                      }}
                      onMarkReviewed={() => handleMarkReviewed(violation.id)}
                      isBanning={banningHost === violation.host_id}
                      onViewChat={onViewChat}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Tabs>
      </Card>

      {/* Violation Detail Dialog */}
      <Dialog open={!!selectedViolation && !showBanDialog} onOpenChange={() => setSelectedViolation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Violation Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedViolation && (
            <div className="space-y-4">
              {/* Host Info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={selectedViolation.host?.avatar_url || undefined} />
                  <AvatarFallback>
                    {selectedViolation.host?.display_name?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedViolation.host?.display_name}</p>
                  <p className="text-xs text-muted-foreground">ID: {selectedViolation.host?.id?.slice(0, 8)}...</p>
                  {selectedViolation.host?.is_blocked && (
                    <Badge variant="destructive" className="mt-1">Banned</Badge>
                  )}
                </div>
              </div>

              {/* Violation Info */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Violation #:</span>
                  <Badge variant="outline">#{selectedViolation.violation_number}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span>{patternLabels[selectedViolation.detected_pattern] || selectedViolation.detected_pattern}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source:</span>
                  <span className="flex items-center gap-1">
                    {sourceTypeIcons[selectedViolation.source_type]}
                    {sourceTypeLabels[selectedViolation.source_type]}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Beans Deducted:</span>
                  <span className="text-red-400 font-semibold">
                    -{selectedViolation.beans_deducted.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Detection:</span>
                  <Badge variant={selectedViolation.is_auto_detected ? "secondary" : "outline"}>
                    {selectedViolation.is_auto_detected ? "🤖 Auto" : "👤 Manual"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time:</span>
                  <span>{format(new Date(selectedViolation.created_at), "dd MMM yyyy, hh:mm a")}</span>
                </div>
              </div>

              {/* Detected Content */}
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Detected Content:</p>
                <p className="font-mono text-sm break-all">{selectedViolation.detected_content}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            {selectedViolation && !selectedViolation.host?.is_blocked && (
              <Button 
                variant="destructive" 
                onClick={() => setShowBanDialog(true)}
              >
                <Ban className="w-4 h-4 mr-2" />
                Ban Host
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Confirmation Dialog */}
      <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <Ban className="w-5 h-5" />
              Ban this host?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Banning <strong>{selectedViolation?.host?.display_name}</strong> will prevent them from going live or making calls. 
              This is a permanent action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => selectedViolation && handleBanHost(selectedViolation.host_id)}
              disabled={banningHost !== null}
            >
              {banningHost ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Yes, Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Individual Violation Card Component
function ViolationCard({ 
  violation, 
  onView, 
  onBan, 
  onMarkReviewed,
  isBanning,
  onViewChat,
}: { 
  violation: Violation;
  onView: () => void;
  onBan: () => void;
  onMarkReviewed: () => void;
  isBanning: boolean;
  onViewChat?: (user: { id: string; display_name: string | null; avatar_url: string | null; app_uid: string | null }) => void;
}) {
  const isBanned = violation.host?.is_blocked;

  return (
    <div className={`
      p-4 rounded-xl border transition-all
      ${isBanned 
        ? 'bg-red-500/5 border-red-500/30' 
        : violation.is_reviewed 
          ? 'bg-green-500/5 border-green-500/20' 
          : 'bg-amber-500/5 border-amber-500/30'
      }
    `}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Avatar className="w-10 h-10 border-2 border-background">
          <AvatarImage src={violation.host?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">
            {violation.host?.display_name?.charAt(0) || "?"}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{violation.host?.display_name}</span>
            <Badge variant="outline" className="text-[10px]">
              #{violation.violation_number}
            </Badge>
            {isBanned && (
              <Badge variant="destructive" className="text-[10px]">Banned</Badge>
            )}
            {violation.is_reviewed && !isBanned && (
              <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-400">
                Reviewed
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {sourceTypeIcons[violation.source_type]}
            <span>{sourceTypeLabels[violation.source_type]}</span>
            <span>•</span>
            <span>{patternLabels[violation.detected_pattern] || violation.detected_pattern}</span>
          </div>

          <p className="text-xs text-red-400/80 mt-1 font-mono truncate">
            {violation.detected_content}
          </p>

          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(violation.created_at), { addSuffix: true })}
            {violation.beans_deducted > 0 && (
              <span className="text-red-400 ml-2">
                -{violation.beans_deducted.toLocaleString()} beans
              </span>
            )}
          </p>
        </div>

        {/* Three-dot Actions Menu */}
        <div className="flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border min-w-[180px] z-50">
              <DropdownMenuItem className="cursor-pointer" onClick={onView}>
                <Eye className="w-4 h-4 mr-2" /> View Details
              </DropdownMenuItem>
              {onViewChat && violation.host && (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    onViewChat({
                      id: violation.host!.id,
                      display_name: violation.host!.display_name,
                      avatar_url: violation.host!.avatar_url,
                      app_uid: null,
                    });
                  }}
                >
                  <MessageSquare className="w-4 h-4 mr-2" /> View Messages
                </DropdownMenuItem>
              )}
              {!isBanned && !violation.is_reviewed && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-green-500" onClick={onMarkReviewed}>
                    <CheckCircle className="w-4 h-4 mr-2" /> Mark Reviewed
                  </DropdownMenuItem>
                </>
              )}
              {!isBanned && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-red-500" onClick={onBan}>
                    <Ban className="w-4 h-4 mr-2" /> Ban Host
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
