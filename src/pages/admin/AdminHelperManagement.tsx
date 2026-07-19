import { useState, useEffect, useCallback, useRef } from "react";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { useLocation } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  Users, UserPlus, Crown, Gem, DollarSign, FileText, Clock,
  CheckCircle, XCircle, Search, Loader2, RefreshCw, TrendingUp,
  Star, Shield, Banknote, Phone, MessageCircle, Send, Eye,
  MoreVertical, Settings, Plus, Wallet, CreditCard, Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import AdminHelperDiamondTopup from "@/components/admin/AdminHelperDiamondTopup";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
// Interfaces
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
  payment_method: string | null;
  payment_details: {
    method_id?: string;
    method_name?: string;
    transaction_id?: string;
    screenshot_url?: string;
    amount_usd?: number;
  } | null;
  payment_screenshot_url: string | null;
  payment_transaction_id: string | null;
  user?: { display_name: string; avatar_url: string; app_uid: string; country_code: string | null; country_flag: string | null; country_name: string | null; };
  agency?: { name: string; agency_code: string; };
}

interface Helper {
  id: string;
  user_id: string;
  trader_level: number;
  wallet_balance: number;
  is_active: boolean;
  is_verified: boolean;
  payroll_enabled: boolean;
  total_bought: number;
  total_sold: number;
  created_at: string;
  user?: { display_name: string; avatar_url: string; app_uid: string; is_online: boolean; country_code: string | null; country_flag: string | null; country_name: string | null; };
}

interface UpgradeRequest {
  id: string;
  helper_id: string;
  requested_level: number;
  amount_usd: number;
  payment_method: string;
  status: string;
  created_at: string;
  helper?: { user?: { display_name: string; avatar_url: string; } };
}

interface DiamondPackage {
  id: string;
  level_number: number;
  diamond_amount: number;
  price_usd: number;
  is_active: boolean;
  display_order?: number | null;
  description?: string | null;
}

const getDiamondPackageLevel = (pkg: Partial<DiamondPackage>, index: number) => {
  const descriptionMatch = pkg.description?.match(/level\s*(\d+)/i);
  return pkg.display_order || (descriptionMatch ? Number(descriptionMatch[1]) : index + 1);
};

const normalizeDiamondPackages = (rows: any[] = []): DiamondPackage[] =>
  rows.map((pkg, index) => ({
    ...pkg,
    level_number: getDiamondPackageLevel(pkg, index),
  }));

const AdminHelperManagement = () => {
  const { toast } = useToast();
  const imageViewer = useImageViewer();
  const [activeTab, setActiveTab] = useState("applications");
  const [loading, setLoading] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  // Applications state
  const [applications, setApplications] = useState<HelperApplication[]>([]);
  const [selectedApp, setSelectedApp] = useState<HelperApplication | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");

  // Helpers state
  const [helpers, setHelpers] = useState<Helper[]>([]);

  // Requests state
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [topupRequests, setTopupRequests] = useState<any[]>([]);
  const [requestsSubTab, setRequestsSubTab] = useState("upgrades");

  // Diamond pricing state
  const [diamondPackages, setDiamondPackages] = useState<DiamondPackage[]>([]);

  // Stats
  const [stats, setStats] = useState({
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    totalHelpers: 0,
    activeHelpers: 0,
    level5Helpers: 0,
    pendingUpgrades: 0,
    pendingTopups: 0,
    pendingPayroll: 0,
  });
  
  // Payroll applications state
  const [payrollApplications, setPayrollApplications] = useState<any[]>([]);

  const location = useLocation();

  useEffect(() => {
    loadData();
  }, [location.pathname]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadApplications(),
        loadHelpers(),
        loadRequests(),
        loadDiamondPricing(),
        loadPayrollApplications(),
        loadStats(),
      ]);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHelperManagement", message: formatAdminError(error)});
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(
    ['helper_applications', 'helper_upgrade_requests', 'helper_topup_requests', 'helper_withdrawal_requests', 'helper_orders', 'topup_helpers'],
    loadData,
    'admin-helper-mgmt-rt'
  );

  const loadApplications = async () => {
    const { data } = await supabase
      .from('helper_applications')
      .select(`
        *,
        user:profiles!helper_applications_user_id_fkey(display_name, avatar_url, app_uid, country_code, country_flag, country_name)
      `)
      .order('created_at', { ascending: false });
    setApplications((data || []) as HelperApplication[]);
  };

  const loadHelpers = async () => {
    const { data } = await supabase
      .from('topup_helpers')
      .select(`*, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, is_online, country_code, country_flag, country_name)`)
      .order('created_at', { ascending: false });
    setHelpers((data || []) as Helper[]);
  };

  const loadRequests = async () => {
    const { data: upgrades } = await supabase
      .from('helper_upgrade_requests')
      .select(`*, helper:topup_helpers(user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url))`)
      .order('created_at', { ascending: false });
    setUpgradeRequests((upgrades || []) as UpgradeRequest[]);

    const { data: topups } = await supabase
      .from('helper_topup_requests')
      .select(`*, helper:topup_helpers(user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url))`)
      .order('created_at', { ascending: false });
    setTopupRequests(topups || []);
  };

  const loadDiamondPricing = async () => {
    const { data } = await supabase
      .from('helper_diamond_packages')
      .select('*')
      .order('display_order', { ascending: true });
    setDiamondPackages(normalizeDiamondPackages(data || []));
  };

  const loadStats = async () => {
    // Pkg6: single server-side aggregation RPC (replaces 9 parallel COUNT queries)
    const { data: statsData } = await supabase.rpc('admin_helper_management_stats');
    const s = (statsData as any) || {};

    setStats({
      pendingApplications: s.pendingApplications || 0,
      approvedApplications: s.approvedApplications || 0,
      rejectedApplications: s.rejectedApplications || 0,
      totalHelpers: s.totalHelpers || 0,
      activeHelpers: s.activeHelpers || 0,
      level5Helpers: s.level5Helpers || 0,
      pendingUpgrades: s.pendingUpgrades || 0,
      pendingTopups: s.pendingTopups || 0,
      pendingPayroll: s.pendingPayroll || 0,
    });
  };
  
  const loadPayrollApplications = async () => {
    const { data } = await supabase
      .from('topup_helpers')
      .select(`
        id, user_id, trader_level, wallet_balance, payroll_status, payroll_applied_at,
        user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
      `)
      .eq('trader_level', 5)
      .not('payroll_status', 'is', null)
      .order('payroll_applied_at', { ascending: false });
    setPayrollApplications(data || []);
  };
  
  const handleApprovePayroll = async (helper: any) => {
    if (!guardStart(`payroll-approve-${helper.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(helper.id));
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      
      const { error } = await supabase
        .from('topup_helpers')
        .update({
          payroll_enabled: true,
          payroll_status: 'approved',
          payroll_approved_at: new Date().toISOString(),
          payroll_approved_by: user?.id
        })
        .eq('id', helper.id);

      if (error) throw error;

      // Send notification
      await adminSendNotification(helper.user_id, '🎉 Payroll Access Approved!', 'You can now access the Level 5 Dashboard and process withdrawals.', 'payroll_approved')

      toast({ title: "Approved! ✅", description: "Payroll access granted" });
      loadPayrollApplications();
      loadStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(helper.id);
        return next;
      });
      guardEnd(`payroll-approve-${helper.id}`);
    }
  };
  
  const handleRejectPayroll = async (helper: any) => {
    if (!guardStart(`payroll-reject-${helper.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(helper.id));
    try {
      const { error } = await supabase
        .from('topup_helpers')
        .update({
          payroll_status: 'rejected',
          payroll_enabled: false
        })
        .eq('id', helper.id);

      if (error) throw error;

      // Send notification
      await adminSendNotification(helper.user_id, '❌ Payroll Access Rejected', 'Your payroll access request has been rejected. You can apply again.', 'payroll_rejected')

      toast({ title: "Rejected", description: "Payroll application rejected" });
      loadPayrollApplications();
      loadStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(helper.id);
        return next;
      });
      guardEnd(`payroll-reject-${helper.id}`);
    }
  };

  const handleApproveApplication = async (app: HelperApplication) => {
    if (!guardStart(`app-approve-${app.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(app.id));
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;

      const { error: updateError } = await supabase
        .from('helper_applications')
        .update({
          status: 'approved',
          admin_notes: adminNotes || null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', app.id);

      if (updateError) throw updateError;

      // Check if admin has a profile (required for approved_by FK)
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user?.id)
        .maybeSingle();

      // Get applicant's country_code from profiles
      const { data: applicantProfile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('id', app.user_id)
        .maybeSingle();

      const { error: helperError } = await supabase
        .from('topup_helpers')
        .upsert({
          user_id: app.user_id,
          is_active: true,
          is_verified: true,
          trader_level: app.requested_level,
          payroll_enabled: app.payroll_requested,
          payroll_status: app.payroll_requested ? 'approved' : null,
          country_code: applicantProfile?.country_code || null,
          approved_at: new Date().toISOString(),
          approved_by: adminProfile ? user?.id : null
        }, { onConflict: 'user_id' });

      if (helperError) throw helperError;

      await adminSendNotification(app.user_id, '🎉 Helper Application Approved!', `Your application for Level ${app.requested_level} Helper has been approved!`, 'helper_approved')

      toast({ title: "Approved! ✅", description: "Helper application approved" });
      setShowDetailDialog(false);
      setSelectedApp(null);
      setAdminNotes("");
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminHelperManagement.HandleapproveapplicationError", message: formatAdminError(error)});
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
      guardEnd(`app-approve-${app.id}`);
    }
  };

  const handleRejectApplication = async (app: HelperApplication) => {
    if (!adminNotes) {
      toast({ title: "Notes Required", description: "Please provide rejection reason", variant: "destructive" });
      return;
    }
    if (!guardStart(`app-reject-${app.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(app.id));
    try {
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;

      const { error: updateError } = await supabase
        .from('helper_applications')
        .update({
          status: 'rejected',
          admin_notes: adminNotes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', app.id);
      if (updateError) throw updateError;

      await adminSendNotification(app.user_id, '❌ Helper Application Rejected', adminNotes, 'helper_rejected')

      toast({ title: "Rejected", description: "Application rejected" });
      setShowDetailDialog(false);
      setSelectedApp(null);
      setAdminNotes("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
      guardEnd(`app-reject-${app.id}`);
    }
  };

  const handleApproveUpgrade = async (req: UpgradeRequest) => {
    console.log("handleApproveUpgrade called with:", req);
    if (!guardStart(`upgrade-${req.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(req.id));
    try {
      const { error: updateError } = await supabase
        .from('helper_upgrade_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', req.id);

      if (updateError) {
        recordAdminError({ kind: "rpc", label: "AdminHelperManagement.ErrorUpdatingUpgradeRequest", message: formatAdminError(updateError)});
        throw updateError;
      }

      const { error: helperError } = await supabase
        .from('topup_helpers')
        .update({ trader_level: req.requested_level })
        .eq('id', req.helper_id);

      if (helperError) {
        recordAdminError({ kind: "rpc", label: "AdminHelperManagement.ErrorUpdatingHelperLevel", message: formatAdminError(helperError)});
        throw helperError;
      }

      toast({ title: "Approved!", description: `Upgraded to Level ${req.requested_level}` });
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminHelperManagement.HandleapproveupgradeError", message: formatAdminError(error)});
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
      guardEnd(`upgrade-${req.id}`);
    }
  };

  const handleApproveTopup = async (req: any) => {
    console.log("handleApproveTopup called with:", req);
    if (!guardStart(`topup-${req.id}`)) return;
    setProcessingIds(prev => new Set(prev).add(req.id));
    try {
      const { data, error } = await supabase.rpc('admin_approve_helper_topup', {
        _request_id: req.id,
        _amount_usd: req.amount_usd ?? null,
        _admin_notes: null,
      });

      if (error) throw error;
      const result = data as { success?: boolean; error?: string; diamonds?: number; diamonds_credited?: number } | null;
      if (result?.success === false) throw new Error(result.error || 'Topup approval failed');

      const credited = Number(result?.diamonds ?? result?.diamonds_credited ?? req.diamond_amount ?? 0);
      toast({ title: "Approved!", description: `${credited.toLocaleString()} diamonds added to wallet` });
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminHelperManagement.HandleapprovetopupError", message: formatAdminError(error)});
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
      guardEnd(`topup-${req.id}`);
    }
  };

  const updateDiamondPackage = async (pkg: DiamondPackage) => {
    try {
      const { error } = await supabase
        .from('helper_diamond_packages')
        .update({
          diamond_amount: pkg.diamond_amount,
          price_usd: pkg.price_usd,
          is_active: pkg.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', pkg.id);

      if (error) throw error;

      toast({ title: "Saved!", description: `Level ${pkg.level_number} pricing updated` });
      loadDiamondPricing();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-500 text-white">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-500 text-white">Rejected</Badge>;
      case 'pending': return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = !searchQuery || 
      app.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.user?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredHelpers = helpers.filter(h => {
    if (!searchQuery) return true;
    return h.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.user?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="admin-pro-shell space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-violet-700 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 md:w-6 md:h-6" />
              Helper Management
            </h1>
            <p className="text-slate-700 text-sm mt-1">Manage all helper-related operations</p>
          </div>
          <Button variant="outline" onClick={loadData} className="bg-white/20 border-white/30 text-slate-900 hover:bg-white/30 self-start md:self-auto">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/30 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.pendingApplications}</p>
                <p className="text-xs text-slate-400">Pending Apps</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/30 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.activeHelpers}</p>
                <p className="text-xs text-slate-400">Active Helpers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/30 rounded-xl flex items-center justify-center">
                <Gem className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.level5Helpers}</p>
                <p className="text-xs text-slate-400">Level 5 Helpers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/30 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.pendingUpgrades + stats.pendingTopups}</p>
                <p className="text-xs text-slate-400">Pending Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-7 h-auto bg-slate-50 border border-slate-200 p-1 rounded-lg">
          <TabsTrigger value="applications" className="gap-2 py-3 relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Applications</span>
            {stats.pendingApplications > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] h-5 min-w-5">
                {stats.pendingApplications}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="helpers" className="gap-2 py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Helpers</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 py-3 relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Requests</span>
            {(stats.pendingUpgrades + stats.pendingTopups) > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] h-5 min-w-5">
                {stats.pendingUpgrades + stats.pendingTopups}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-2 py-3 relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <Banknote className="w-4 h-4" />
            <span className="hidden sm:inline">Payroll</span>
            {stats.pendingPayroll > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] h-5 min-w-5">
                {stats.pendingPayroll}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="level5" className="gap-2 py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <Gem className="w-4 h-4" />
            <span className="hidden sm:inline">Level 5</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2 py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-violet-600 data-[state=active]:text-white text-slate-400">
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="diamond-topup" className="gap-2 py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white text-slate-400">
            <Gem className="w-4 h-4" />
            <span className="hidden sm:inline">💎 Topup</span>
          </TabsTrigger>
        </TabsList>

        {/* Applications Tab */}
        <TabsContent value="applications" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-slate-50 border-slate-200 text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filteredApplications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No applications found</div>
            ) : (
              filteredApplications.map((app) => {
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
                            <Badge variant="outline" className="text-[10px]">{app.user?.app_uid}</Badge>
                            {app.user?.country_flag && (
                              <span className="text-sm" title={app.user.country_name || app.user.country_code || ''}>{app.user.country_flag}</span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <div className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs bg-gradient-to-r",
                              levelBadge.color
                            )}>
                              <LevelIcon className="w-3 h-3" />
                              <span>Level {app.requested_level}</span>
                            </div>
                            {app.payroll_requested && (
                              <Badge className="bg-purple-500 text-white text-[10px]">Payroll</Badge>
                            )}
                          </div>
                          
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>

                        {getStatusBadge(app.status)}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedApp(app);
                            setAdminNotes(app.admin_notes || "");
                            setShowDetailDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* All Helpers Tab */}
        <TabsContent value="helpers" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search helpers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Helper</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payroll</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHelpers.map((helper) => {
                const levelBadge = getLevelBadge(helper.trader_level);
                const LevelIcon = levelBadge.icon;
                
                return (
                  <TableRow key={helper.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <UserAvatarImage seed={(((helper.user) as any)?.id ?? ((helper.user) as any)?.user_id ?? ((helper.user) as any)?.host_id)} gender={((helper.user) as any)?.gender} src={helper.user?.avatar_url} />
                          <AvatarFallback>{helper.user?.display_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium">{helper.user?.display_name}</p>
                            {helper.user?.country_flag && (
                              <span className="text-sm" title={helper.user.country_name || helper.user.country_code || ''}>{helper.user.country_flag}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{helper.user?.app_uid}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg text-white text-xs bg-gradient-to-r w-fit",
                        levelBadge.color
                      )}>
                        <LevelIcon className="w-3 h-3" />
                        <span>{levelBadge.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Gem className="w-4 h-4 text-cyan-500" />
                        <span className="font-medium">{helper.wallet_balance?.toLocaleString()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={helper.is_active ? "bg-green-500" : "bg-slate-500"}>
                        {helper.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {helper.payroll_enabled ? (
                        <Badge className="bg-purple-500 text-white">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          <Tabs value={requestsSubTab} onValueChange={setRequestsSubTab}>
            <TabsList>
              <TabsTrigger value="upgrades" className="relative">
                Level Upgrades
                {stats.pendingUpgrades > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white text-[10px]">{stats.pendingUpgrades}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="topups" className="relative">
                Manual Top-ups
                {stats.pendingTopups > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white text-[10px]">{stats.pendingTopups}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upgrades" className="space-y-3 mt-4">
              {upgradeRequests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No pending upgrade requests</div>
              ) : (
                upgradeRequests.filter(r => r.status === 'pending').map((req) => (
                  <Card key={req.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <UserAvatarImage seed={(((req.helper?.user) as any)?.id ?? ((req.helper?.user) as any)?.user_id ?? ((req.helper?.user) as any)?.host_id)} gender={((req.helper?.user) as any)?.gender} src={req.helper?.user?.avatar_url} />
                          <AvatarFallback>H</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{req.helper?.user?.display_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Level {req.requested_level} • ${req.amount_usd}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-pink-500 hover:bg-pink-600 text-white"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Approve button clicked for upgrade:", req.id);
                            handleApproveUpgrade(req);
                          }}
                          disabled={processingIds.has(req.id)}
                        >
                          {processingIds.has(req.id) ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-1" />
                          )}
                          {processingIds.has(req.id) ? "Processing..." : "Approve"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="topups" className="space-y-3 mt-4">
              {topupRequests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No pending topup requests</div>
              ) : (
                topupRequests.filter(r => r.status === 'pending').map((req: any) => (
                  <Card key={req.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <UserAvatarImage seed={(((req.helper?.user) as any)?.id ?? ((req.helper?.user) as any)?.user_id ?? ((req.helper?.user) as any)?.host_id)} gender={((req.helper?.user) as any)?.gender} src={req.helper?.user?.avatar_url} />
                          <AvatarFallback>H</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{req.helper?.user?.display_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {req.diamond_amount?.toLocaleString()} 💎 • ${req.amount_usd}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="bg-pink-500 hover:bg-pink-600 text-white"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Approve button clicked for topup:", req.id);
                            handleApproveTopup(req);
                          }}
                          disabled={processingIds.has(req.id)}
                        >
                          {processingIds.has(req.id) ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-1" />
                          )}
                          {processingIds.has(req.id) ? "Processing..." : "Approve"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Level 5 Helpers Tab */}
        <TabsContent value="level5" className="space-y-4">
          <div className="grid gap-4">
            {helpers.filter(h => h.trader_level === 5).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No Level 5 helpers yet</div>
            ) : (
              helpers.filter(h => h.trader_level === 5).map((helper) => (
                <Card key={helper.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-14 h-14">
                        <UserAvatarImage seed={(((helper.user) as any)?.id ?? ((helper.user) as any)?.user_id ?? ((helper.user) as any)?.host_id)} gender={((helper.user) as any)?.gender} src={helper.user?.avatar_url} />
                        <AvatarFallback>{helper.user?.display_name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{helper.user?.display_name}</h3>
                          <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                            <Gem className="w-3 h-3 mr-1" /> Diamond
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{helper.user?.app_uid}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="flex items-center gap-1">
                            <Wallet className="w-4 h-4" />
                            {helper.wallet_balance?.toLocaleString()} 💎
                          </span>
                          {helper.payroll_enabled && (
                            <Badge className="bg-purple-500 text-white">Payroll Active</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Payroll Applications Tab - Redirect to Level 5 Page */}
        <TabsContent value="payroll" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-purple-500" />
                Payroll Access Management
              </CardTitle>
              <CardDescription>
                Payroll applications are now managed in the dedicated Level 5 Helpers page with country-based filtering
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Gem className="w-8 h-8 text-slate-900" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Level 5 Helper Management</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  All Level 5 payroll applications, withdrawals, and helper management are now centralized in a dedicated page with country-based organization.
                </p>
                <Button 
                  onClick={() => window.location.href = '/admin/level5-helpers'}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                >
                  <Star className="w-4 h-4 mr-2" />
                  Go to Level 5 Helpers Page
                </Button>
                
                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4 mt-6 max-w-md mx-auto">
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                    <p className="text-2xl font-bold text-orange-600">{stats.pendingPayroll}</p>
                    <p className="text-xs text-muted-foreground">Pending Applications</p>
                  </div>
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <p className="text-2xl font-bold text-green-600">{stats.level5Helpers}</p>
                    <p className="text-xs text-muted-foreground">Active Level 5</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diamond Pricing Tab */}
        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gem className="w-5 h-5 text-cyan-500" />
                Diamond Packages by Level
              </CardTitle>
              <CardDescription>
                Higher level helpers get more diamonds for the same price
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead>Diamond Amount</TableHead>
                    <TableHead>Price (USD)</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diamondPackages.map((pkg) => {
                    const levelInfo = getLevelBadge(pkg.level_number);
                    const LevelIcon = levelInfo.icon;
                    
                    return (
                      <TableRow key={pkg.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-r",
                              levelInfo.color
                            )}>
                              <LevelIcon className="w-4 h-4 text-slate-900" />
                            </div>
                            <span>{levelInfo.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={pkg.diamond_amount}
                            onChange={(e) => {
                              setDiamondPackages(prev => prev.map(p => 
                                p.id === pkg.id ? { ...p, diamond_amount: Number(e.target.value) } : p
                              ));
                            }}
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={pkg.price_usd}
                            onChange={(e) => {
                              setDiamondPackages(prev => prev.map(p => 
                                p.id === pkg.id ? { ...p, price_usd: Number(e.target.value) } : p
                              ));
                            }}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={pkg.is_active}
                            onCheckedChange={(checked) => {
                              setDiamondPackages(prev => prev.map(p => 
                                p.id === pkg.id ? { ...p, is_active: checked } : p
                              ));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => updateDiamondPackage(pkg)}>
                            <Save className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diamond Topup Tab */}
        <TabsContent value="diamond-topup" className="space-y-4">
          <AdminHelperDiamondTopup />
        </TabsContent>
      </Tabs>

      {/* Application Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>
          
          {selectedApp && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <UserAvatarImage seed={(((selectedApp.user) as any)?.id ?? ((selectedApp.user) as any)?.user_id ?? ((selectedApp.user) as any)?.host_id)} gender={((selectedApp.user) as any)?.gender} src={selectedApp.user?.avatar_url} />
                  <AvatarFallback>{selectedApp.user?.display_name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg">{selectedApp.user?.display_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedApp.user?.app_uid}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Requested Level</Label>
                  <p className="font-semibold">Level {selectedApp.requested_level}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Payroll</Label>
                  <p className="font-semibold">{selectedApp.payroll_requested ? "Yes" : "No"}</p>
                </div>
              </div>

              {selectedApp.reason && (
                <div>
                  <Label className="text-muted-foreground">Reason</Label>
                  <p className="text-sm">{selectedApp.reason}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-muted-foreground">Contact Info</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedApp.contact_phone && (
                    <Badge variant="outline" className="gap-1">
                      <Phone className="w-3 h-3" /> {selectedApp.contact_phone}
                    </Badge>
                  )}
                  {selectedApp.contact_whatsapp && (
                    <Badge variant="outline" className="gap-1">
                      <MessageCircle className="w-3 h-3" /> {selectedApp.contact_whatsapp}
                    </Badge>
                  )}
                  {selectedApp.contact_telegram && (
                    <Badge variant="outline" className="gap-1">
                      <Send className="w-3 h-3" /> {selectedApp.contact_telegram}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Payment Information Section */}
              {(selectedApp.payment_method || selectedApp.payment_details) && (
                <div className="space-y-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <Label className="text-emerald-400 font-semibold flex items-center gap-2">
                    💳 Payment Information
                  </Label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {selectedApp.payment_method && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Payment Method</Label>
                        <p className="font-medium text-sm">{selectedApp.payment_method}</p>
                      </div>
                    )}
                    {selectedApp.payment_details?.amount_usd && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Amount</Label>
                        <p className="font-bold text-green-500">${selectedApp.payment_details.amount_usd}</p>
                      </div>
                    )}
                  </div>

                  {/* Transaction ID */}
                  {(selectedApp.payment_transaction_id || selectedApp.payment_details?.transaction_id) && (
                    <div className="bg-slate-50/50 rounded-lg px-3 py-2">
                      <Label className="text-xs text-muted-foreground">Transaction ID</Label>
                      <p className="font-mono text-sm text-emerald-300 break-all">
                        {selectedApp.payment_transaction_id || selectedApp.payment_details?.transaction_id}
                      </p>
                    </div>
                  )}

                  {/* Payment Screenshot */}
                  {(selectedApp.payment_screenshot_url || selectedApp.payment_details?.screenshot_url) && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Payment Screenshot</Label>
                      <div className="relative group">
                        <SmartImage 
                          src={selectedApp.payment_screenshot_url || selectedApp.payment_details?.screenshot_url}
                          alt="Payment Screenshot"
                          className="w-full max-h-64 object-contain rounded-lg border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            const url = selectedApp.payment_screenshot_url || selectedApp.payment_details?.screenshot_url;
                            if (url) imageViewer.openImage(url);
                          }} fallbackSrc="/placeholder.svg" />
                        <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to view full size
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes (required for rejection)..."
                  rows={3}
                />
              </div>

              {selectedApp.status === 'pending' && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => handleRejectApplication(selectedApp)}
                    disabled={processingIds.has(selectedApp.id)}
                  >
                    {processingIds.has(selectedApp.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApproveApplication(selectedApp)}
                    disabled={processingIds.has(selectedApp.id)}
                  >
                    {processingIds.has(selectedApp.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                    Approve
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Screenshot" />
    </>
  );
};

export default AdminHelperManagement;
