import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  Search, Users, CheckCircle, XCircle, Clock,
  Phone, MessageCircle, Send, Crown, Star, Shield, Gem,
  Loader2, Eye, MoreVertical, Banknote, CreditCard, MapPin, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";


import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface HelperApplication {
  id: string;
  user_id: string;
  agency_id: string | null;
  requested_level: number;
  payroll_requested: boolean;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_telegram: string | null;
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  // ID verification fields
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  id_card_name: string | null;
  id_card_number: string | null;
  full_address: string | null;
  country: string | null;
  // Payment fields
  payment_screenshot_url: string | null;
  payment_transaction_id: string | null;
  payment_method: string | null;
  payment_details: any;
  user?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
  agency?: {
    name: string;
    agency_code: string;
  };
}

interface PayrollRequest {
  id: string;
  agency_id: string;
  trader_id: string | null;
  beans_amount: number;
  usd_amount: number;
  payment_method: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  agency?: {
    name: string;
    agency_code: string;
  } | null;
}

const AdminHelperApplications = () => {
  const { toast } = useToast();
  const imageViewer = useImageViewer();
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  const [activeTab, setActiveTab] = useState("applications");
  const [applications, setApplications] = useState<HelperApplication[]>([]);
  const [payrollRequests, setPayrollRequests] = useState<PayrollRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [cryptoOnly, setCryptoOnly] = useState(false);
  
  // Dialog states
  const [selectedApp, setSelectedApp] = useState<HelperApplication | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");

  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    pendingPayroll: 0
  });

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  useAdminRealtime(['helper_applications'], () => loadData());

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch applications
      let query = supabase
        .from('helper_applications')
        .select(`
          *,
          user:profiles!helper_applications_user_id_fkey(display_name, avatar_url, app_uid)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: appsData } = await query;
      setApplications(appsData || []);

      // Pkg6: single server-side aggregation RPC for application stats
      const { data: statsData } = await supabase.rpc('admin_helper_applications_stats');
      const s = (statsData as any) || {};

      // Fetch payroll requests (still needed as a list, not just stats)
      const { data: payrollData } = await supabase
        .from('payroll_requests')
        .select('*')
        .order('created_at', { ascending: false });

      setPayrollRequests((payrollData || []) as PayrollRequest[]);

      setStats({
        pending: s.pending || 0,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
        pendingPayroll: s.pendingPayroll || 0
      });

    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHelperApplications", message: formatAdminError(error)});
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (app: HelperApplication) => {
    if (!guardStart(`approve-${app.id}`)) return;
    setProcessing(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;

      // Update application status
      await supabase
        .from('helper_applications')
        .update({
          status: 'approved',
          admin_notes: adminNotes || null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', app.id);

      // Check if admin has a profile (required for approved_by FK)
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user?.id)
        .maybeSingle();

      // Create topup_helper entry
      await supabase
        .from('topup_helpers')
        .upsert({
          user_id: app.user_id,
          is_active: true,
          is_verified: true,
          trader_level: app.requested_level,
          payroll_enabled: app.payroll_requested,
          approved_at: new Date().toISOString(),
          approved_by: adminProfile ? user?.id : null
        }, { onConflict: 'user_id' });

      // Send notification
      await adminSendNotification(app.user_id, '🎉 Helper Application Approved!', `Your application for Level ${app.requested_level} Helper has been approved!`, 'helper_approved')

      toast({ title: "Approved! ✅", description: "Helper application approved successfully" });
      setShowDetailDialog(false);
      setSelectedApp(null);
      setAdminNotes("");
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      guardEnd(`approve-${app.id}`);
    }
  };

  const handleReject = async (app: HelperApplication, reasonOverride?: string) => {
    const rejectionNotes = (reasonOverride ?? adminNotes ?? '').trim() || 'Rejected by admin';
    if (!guardStart(`reject-${app.id}`)) return;
    setProcessing(true);
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;

      await supabase
        .from('helper_applications')
        .update({
          status: 'rejected',
          admin_notes: rejectionNotes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', app.id);

      // Send notification
      await adminSendNotification(app.user_id, '❌ Helper Application Rejected', rejectionNotes, 'helper_rejected')

      toast({ title: 'Rejected', description: 'Application has been rejected' });
      setShowDetailDialog(false);
      setSelectedApp(null);
      setAdminNotes('');
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
      guardEnd(`reject-${app.id}`);
    }
  };

  const getLevelBadge = (level: number) => {
    const badges: Record<number, { icon: any; color: string; label: string }> = {
      1: { icon: Star, color: "from-amber-600 to-amber-700", label: "Bronze" },
      2: { icon: Star, color: "from-slate-400 to-slate-500", label: "Silver" },
      3: { icon: Crown, color: "from-yellow-400 to-yellow-500", label: "Gold" },
      4: { icon: Shield, color: "from-slate-300 to-slate-400", label: "Platinum" },
      5: { icon: Gem, color: "from-cyan-400 to-blue-500", label: "Diamond" }
    };
    return badges[level] || badges[1];
  };

  const isAutoVerifiedCrypto = (app: HelperApplication) =>
    (app.payment_details as any)?.auto_verified === true;

  const autoVerifiedApps = applications.filter(isAutoVerifiedCrypto);

  const autoVerifiedLevelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of autoVerifiedApps) {
    const lvl = Number(
      (a.payment_details as any)?.detected_level ?? a.requested_level
    );
    if (lvl >= 1 && lvl <= 5) autoVerifiedLevelCounts[lvl]++;
  }

  const filteredApps = applications.filter(app => {
    if (cryptoOnly && !isAutoVerifiedCrypto(app)) return false;
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      app.user?.display_name?.toLowerCase().includes(search) ||
      app.user?.app_uid?.toLowerCase().includes(search) ||
      app.agency?.name?.toLowerCase().includes(search)
    );
  });

  return (
    <>
    <div className="admin-pro-shell space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Helper Applications</h1>
            <p className="text-muted-foreground">Manage helper/trader applications and payroll requests</p>
          </div>
          <Button variant="outline" onClick={() => loadData()}>
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-slate-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
                  <p className="text-xs text-yellow-600">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-slate-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
                  <p className="text-xs text-green-600">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-slate-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
                  <p className="text-xs text-red-600">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-slate-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-700">{stats.pendingPayroll}</p>
                  <p className="text-xs text-purple-600">Payroll Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="w-full overflow-x-auto -mx-2 px-2"><TabsList className="justify-start inline-flex w-max md:w-full">
            <TabsTrigger value="applications" className="gap-2">
              <Users className="w-4 h-4" />
              Applications
              {stats.pending > 0 && (
                <Badge className="ml-1 bg-yellow-500 text-white">{stats.pending}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-2">
              <Banknote className="w-4 h-4" />
              Payroll Requests
              {stats.pendingPayroll > 0 && (
                <Badge className="ml-1 bg-purple-500 text-white">{stats.pendingPayroll}</Badge>
              )}
            </TabsTrigger>
          </TabsList></div>

          <TabsContent value="applications" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, UID, or agency..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={cryptoOnly ? "default" : "outline"}
                onClick={() => setCryptoOnly(v => !v)}
                className="gap-2 whitespace-nowrap"
                title="Show only applications with on-chain auto-verified crypto deposits"
              >
                <span className={cryptoOnly ? "text-emerald-100" : "text-emerald-600"}>✓</span>
                Auto-Verified Crypto
                <Badge variant="secondary" className="ml-1">{autoVerifiedApps.length}</Badge>
              </Button>
            </div>

            {/* Auto-verified crypto by level */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <span className="text-xs font-semibold text-emerald-700">
                ✓ On-chain auto-verified by level:
              </span>
              {[1, 2, 3, 4, 5].map((lvl) => (
                <Badge
                  key={lvl}
                  variant="outline"
                  className="bg-white/70 border-emerald-300 text-emerald-800"
                >
                  L{lvl}: {autoVerifiedLevelCounts[lvl]}
                </Badge>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                Total {autoVerifiedApps.length}
              </span>
            </div>

            {/* Applications List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No applications found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredApps.map((app) => {
                  const levelBadge = getLevelBadge(app.requested_level);
                  const LevelIcon = levelBadge.icon;
                  
                  return (
                    <Card key={app.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            <UserAvatarImage seed={(((app.user) as any)?.id ?? ((app.user) as any)?.user_id ?? ((app.user) as any)?.host_id)} gender={((app.user) as any)?.gender} src={app.user?.avatar_url} />
                            <AvatarFallback>{app.user?.display_name?.[0]}</AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{app.user?.display_name}</h3>
                              <Badge variant="outline" className="text-[10px]">
                                {app.user?.app_uid}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {/* Level Badge */}
                              <div className={cn(
                                "flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs bg-gradient-to-r",
                                levelBadge.color
                              )}>
                                <LevelIcon className="w-3 h-3" />
                                <span>Level {app.requested_level}</span>
                              </div>
                              
                              {/* Payroll Badge */}
                              {app.payroll_requested && (
                                <Badge className="bg-purple-500 text-white text-[10px]">
                                  Payroll
                                </Badge>
                               )}
                               
                               {/* ID Verified Badge */}
                               {app.id_card_front_url && (
                                 <Badge className="bg-amber-500 text-white text-[10px]">
                                   ID Card
                                 </Badge>
                               )}
                              
                              {/* Agency */}
                              {app.agency && (
                                <Badge variant="outline" className="text-[10px]">
                                  {app.agency.name}
                                </Badge>
                              )}
                            </div>
                            
                            <p className="text-xs text-muted-foreground mt-1">
                              Applied {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>

                          {/* Status Badge */}
                          <Badge 
                            variant={
                              app.status === 'approved' ? 'default' :
                              app.status === 'rejected' ? 'destructive' :
                              'secondary'
                            }
                            className={cn(
                              app.status === 'approved' && 'bg-green-500',
                              app.status === 'pending' && 'bg-yellow-500 text-white'
                            )}
                          >
                            {app.status}
                          </Badge>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {app.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 bg-green-600 hover:bg-green-700"
                                  disabled={processing}
                                  onClick={() => handleApprove(app)}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8"
                                  disabled={processing}
                                  onClick={() => handleReject(app, 'Rejected by admin')}
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedApp(app);
                                  setAdminNotes(app.admin_notes || '');
                                  setShowDetailDialog(true);
                                }}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {app.status === 'pending' && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedApp(app);
                                        handleApprove(app);
                                      }}
                                      className="text-green-600"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Quick Approve
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4">
            {payrollRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No payroll requests found
              </div>
            ) : (
              <div className="space-y-3">
                {payrollRequests.map((req) => (
                  <Card key={req.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{req.agency?.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {req.beans_amount.toLocaleString()} beans = ${req.usd_amount}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <Badge 
                          variant={
                            req.status === 'completed' ? 'default' :
                            req.status === 'rejected' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {req.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
            {selectedApp && (
              <>
                <DialogHeader>
                  <DialogTitle>Application Details</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {/* User Info */}
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                    <Avatar className="w-12 h-12">
                      <UserAvatarImage seed={(((selectedApp.user) as any)?.id ?? ((selectedApp.user) as any)?.user_id ?? ((selectedApp.user) as any)?.host_id)} gender={((selectedApp.user) as any)?.gender} src={selectedApp.user?.avatar_url} />
                      <AvatarFallback>{selectedApp.user?.display_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{selectedApp.user?.display_name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedApp.user?.app_uid}</p>
                    </div>
                  </div>

                  {/* Level Requested */}
                  <div className="p-3 bg-muted/50 rounded-xl">
                    <p className="text-sm text-muted-foreground">Requested Level</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={cn(
                        "flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm bg-gradient-to-r",
                        getLevelBadge(selectedApp.requested_level).color
                      )}>
                        {(() => {
                          const LvlIcon = getLevelBadge(selectedApp.requested_level).icon;
                          return <LvlIcon className="w-4 h-4" />;
                        })()}
                        <span>Level {selectedApp.requested_level} - {getLevelBadge(selectedApp.requested_level).label}</span>
                      </div>
                      {selectedApp.payroll_requested && (
                        <Badge className="bg-purple-500 text-white">Payroll</Badge>
                      )}
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Contact Information</p>
                    <div className="space-y-2">
                      {selectedApp.contact_phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedApp.contact_phone}</span>
                        </div>
                      )}
                      {selectedApp.contact_whatsapp && (
                        <a 
                          href={`https://wa.me/${selectedApp.contact_whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-green-600 hover:underline"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{selectedApp.contact_whatsapp}</span>
                        </a>
                      )}
                      {selectedApp.contact_telegram && (
                        <a 
                          href={`https://t.me/${selectedApp.contact_telegram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <Send className="w-4 h-4" />
                          <span>{selectedApp.contact_telegram}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Reason */}
                  {selectedApp.reason && (
                    <div className="p-3 bg-muted/50 rounded-xl">
                      <p className="text-sm text-muted-foreground">Application Reason</p>
                      <p className="text-sm mt-1">{selectedApp.reason}</p>
                    </div>
                  )}

                  {/* Payment Details — covers BOTH legacy screenshot uploads AND new MeriCash crypto auto deposits */}
                  {(selectedApp.payment_screenshot_url || selectedApp.payment_transaction_id || selectedApp.payment_details) && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        💎 Payment Verification
                        {(selectedApp.payment_details as any)?.auto_verified && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            ✓ AUTO-VERIFIED ON-CHAIN
                          </span>
                        )}
                      </p>
                      <div className="p-3 bg-muted/50 rounded-xl space-y-2 text-sm">
                        {selectedApp.payment_method && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Method:</span>
                            <span className="font-medium">{selectedApp.payment_method}</span>
                          </div>
                        )}
                        {(selectedApp.payment_details as any)?.amount_usd != null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount Paid (on-chain):</span>
                            <span className="font-bold text-emerald-600">${(selectedApp.payment_details as any).amount_usd}</span>
                          </div>
                        )}
                        {(selectedApp.payment_details as any)?.detected_level != null && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Auto-detected Level:</span>
                            <span className="flex items-center gap-1.5">
                              <span className="font-bold text-purple-600">L{(selectedApp.payment_details as any).detected_level}</span>
                              {(selectedApp.payment_details as any).auto_level_adjusted ? (
                                <span className="text-[9px] font-semibold text-amber-700 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                  AUTO-UPGRADED from L{(selectedApp.payment_details as any).selected_level}
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  MATCHED L{(selectedApp.payment_details as any).selected_level}
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Pkg77 — Detailed Level Auto-Detection Audit.
                            Shows selected_level vs detected_level vs auto_level_adjusted
                            in a single explicit panel so admin can verify Pkg65 logic at a glance. */}
                        {(() => {
                          const pd = (selectedApp.payment_details as any) || {};
                          const hasAudit =
                            pd.selected_level != null ||
                            pd.detected_level != null ||
                            pd.auto_level_adjusted != null;
                          if (!hasAudit) return null;
                          const sel = pd.selected_level;
                          const det = pd.detected_level;
                          const adj = pd.auto_level_adjusted === true;
                          const matched = sel != null && det != null && Number(sel) === Number(det);
                          const upgraded = sel != null && det != null && Number(det) > Number(sel);
                          const downgraded = sel != null && det != null && Number(det) < Number(sel);
                          return (
                            <div
                              data-testid="level-audit-block"
                              className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-2.5 space-y-1.5"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                                Level Auto-Detection Audit
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <div className="space-y-0.5">
                                  <div className="text-muted-foreground">User selected</div>
                                  <div className="font-bold text-foreground">
                                    {sel != null ? `L${sel}` : "—"}
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="text-muted-foreground">On-chain detected</div>
                                  <div className="font-bold text-purple-600">
                                    {det != null ? `L${det}` : "—"}
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="text-muted-foreground">Adjusted</div>
                                  <div
                                    className={
                                      adj
                                        ? "font-bold text-amber-600"
                                        : "font-bold text-emerald-600"
                                    }
                                  >
                                    {adj ? "YES" : "NO"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1 pt-1">
                                {matched && (
                                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                    ✓ MATCHED
                                  </span>
                                )}
                                {upgraded && (
                                  <span className="text-[9px] font-semibold text-amber-700 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    ▲ AUTO-UPGRADED L{sel} → L{det}
                                  </span>
                                )}
                                {downgraded && (
                                  <span className="text-[9px] font-semibold text-red-700 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded">
                                    ▼ DOWNGRADED L{sel} → L{det} (paid less than selected)
                                  </span>
                                )}
                                {pd.auto_verified === true && (
                                  <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                    ✓ ON-CHAIN VERIFIED
                                  </span>
                                )}
                                {pd.verified_at && (
                                  <span className="text-[9px] text-muted-foreground">
                                    @ {new Date(pd.verified_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <details className="pt-1">
                                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                                  Show raw payment_details JSON
                                </summary>
                                <pre className="mt-1 max-h-48 overflow-auto rounded bg-background/60 p-2 text-[10px] leading-snug">
                                  {JSON.stringify(pd, null, 2)}
                                </pre>
                              </details>
                            </div>
                          );
                        })()}
                        {(selectedApp.payment_details as any)?.diamonds_credited != null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Diamonds Credited:</span>
                            <span className="font-bold text-amber-600">
                              {Number((selectedApp.payment_details as any).diamonds_credited).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {selectedApp.payment_transaction_id && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Transaction ID:</span>
                            <span className="font-mono text-xs break-all text-right">{selectedApp.payment_transaction_id}</span>
                          </div>
                        )}
                        {(selectedApp.payment_details as any)?.topup_id && (selectedApp.payment_details as any).topup_id !== selectedApp.payment_transaction_id && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Top-up Ref:</span>
                            <span className="font-mono text-xs break-all text-right">{(selectedApp.payment_details as any).topup_id}</span>
                          </div>
                        )}
                        {selectedApp.payment_screenshot_url && (
                          <SmartImage
                            src={selectedApp.payment_screenshot_url}
                            alt="Payment Screenshot"
                            className="w-full h-auto max-h-48 object-contain rounded-lg border cursor-pointer mt-2"
                            onClick={() => imageViewer.openImage(selectedApp.payment_screenshot_url!)}
                            fallbackSrc="/placeholder.svg"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* ID Card Verification - Level 5 */}
                  {(selectedApp.id_card_front_url || selectedApp.id_card_name) && (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-amber-500" />
                        ID Card Verification
                      </p>
                      
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                        {/* ID Details */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {selectedApp.id_card_name && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">Name on ID</p>
                              <p className="font-medium">{selectedApp.id_card_name}</p>
                            </div>
                          )}
                          {selectedApp.id_card_number && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">ID Number</p>
                              <p className="font-mono font-medium">{selectedApp.id_card_number}</p>
                            </div>
                          )}
                          {selectedApp.country && (
                            <div>
                              <p className="text-[10px] text-muted-foreground">Country</p>
                              <p className="font-medium">{selectedApp.country}</p>
                            </div>
                          )}
                        </div>

                        {/* Full Address */}
                        {selectedApp.full_address && (
                          <div className="text-sm">
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> Full Address
                            </p>
                            <p className="font-medium mt-0.5">{selectedApp.full_address}</p>
                          </div>
                        )}

                        {/* ID Card Images */}
                        <div className="grid grid-cols-2 gap-2">
                          {selectedApp.id_card_front_url && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground">Front Side</p>
                              <div className="relative group">
                                <SmartImage 
                                  src={selectedApp.id_card_front_url}
                                  alt="ID Front" 
                                  className="w-full h-32 object-cover rounded-lg border border-amber-500/30 cursor-pointer"
                                  onClick={() => imageViewer.openImage(selectedApp.id_card_front_url!)} fallbackSrc="/placeholder.svg" />
                                <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="w-5 h-5 text-slate-900" />
                                </div>
                              </div>
                            </div>
                          )}
                          {selectedApp.id_card_back_url && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground">Back Side</p>
                              <div className="relative group">
                                <SmartImage 
                                  src={selectedApp.id_card_back_url}
                                  alt="ID Back" 
                                  className="w-full h-32 object-cover rounded-lg border border-amber-500/30 cursor-pointer"
                                  onClick={() => imageViewer.openImage(selectedApp.id_card_back_url!)} fallbackSrc="/placeholder.svg" />
                                <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="w-5 h-5 text-slate-900" />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Admin Notes</p>
                    <Textarea
                      placeholder="Add notes or rejection reason..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <DialogFooter className="flex gap-2">
                  {selectedApp.status === 'pending' && (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(selectedApp)}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleApprove(selectedApp)}
                        disabled={processing}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                        Approve
                      </Button>
                    </>
                  )}
                  {selectedApp.status !== 'pending' && (
                    <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                      Close
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Screenshot" />
    </>
  );
};

export default AdminHelperApplications;
