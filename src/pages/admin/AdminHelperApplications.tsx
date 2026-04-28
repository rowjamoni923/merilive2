import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";


import { adminSendNotification } from "@/utils/adminNotification";

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
          user:profiles!helper_applications_user_id_fkey(display_name, avatar_url, app_uid),
          agency:agencies(name, agency_code)
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
        .select(`
          *,
          agency:agencies(name, agency_code)
        `)
        .order('created_at', { ascending: false });

      setPayrollRequests((payrollData || []) as PayrollRequest[]);

      setStats({
        pending: s.pending || 0,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
        pendingPayroll: s.pendingPayroll || 0
      });

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (app: HelperApplication) => {
    if (!guardStart(`approve-${app.id}`)) return;
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

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
      const { data: { user } } = await supabase.auth.getUser();

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

  const filteredApps = applications.filter(app => {
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
    <div className="space-y-6">
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
          <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-yellow-200 dark:border-yellow-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.pending}</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.approved}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.rejected}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.pendingPayroll}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">Payroll Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
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
          </TabsList>

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
                            <AvatarImage src={app.user?.avatar_url} />
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
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            {selectedApp && (
              <>
                <DialogHeader>
                  <DialogTitle>Application Details</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {/* User Info */}
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={selectedApp.user?.avatar_url} />
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

                  {/* Payment Details */}
                  {selectedApp.payment_screenshot_url && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Payment Proof</p>
                      <div className="p-3 bg-muted/50 rounded-xl space-y-2">
                        {selectedApp.payment_transaction_id && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Transaction ID:</span>
                            <span className="font-mono">{selectedApp.payment_transaction_id}</span>
                          </div>
                        )}
                        <img 
                          src={selectedApp.payment_screenshot_url} 
                          alt="Payment Screenshot" 
                          className="w-full h-auto max-h-48 object-contain rounded-lg border cursor-pointer"
                          onClick={() => imageViewer.openImage(selectedApp.payment_screenshot_url!)}
                        />
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
                                <img 
                                  src={selectedApp.id_card_front_url}
                                  alt="ID Front" 
                                  className="w-full h-32 object-cover rounded-lg border border-amber-500/30 cursor-pointer"
                                  onClick={() => imageViewer.openImage(selectedApp.id_card_front_url!)}
                                />
                                <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="w-5 h-5 text-white" />
                                </div>
                              </div>
                            </div>
                          )}
                          {selectedApp.id_card_back_url && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground">Back Side</p>
                              <div className="relative group">
                                <img 
                                  src={selectedApp.id_card_back_url}
                                  alt="ID Back" 
                                  className="w-full h-32 object-cover rounded-lg border border-amber-500/30 cursor-pointer"
                                  onClick={() => imageViewer.openImage(selectedApp.id_card_back_url!)}
                                />
                                <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <ExternalLink className="w-5 h-5 text-white" />
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
