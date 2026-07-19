import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Search, Headphones, Wallet, CircleDot, DollarSign, Loader2, Shield, Users, Copy } from "lucide-react";
import { CopyableUid } from "@/components/admin/CopyableUid";

interface HelperData {
  id: string;
  user_id: string;
  is_active: boolean | null;
  is_verified: boolean | null;
  wallet_balance: number | null;
  total_earnings: number | null;
  total_bought: number | null;
  total_sold: number | null;
  trader_level: number | null;
  payroll_enabled: boolean | null;
  payroll_status: string | null;
  country_code: string | null;
  created_at: string | null;
  commission_rate: number | null;
  agency_code?: string | null;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    is_online: boolean | null;
    country_code: string | null;
    country_flag: string | null;
    country_name: string | null;
  };
}

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied!`);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 hover:text-amber-400 transition-colors">
      <Copy className="w-3 h-3 opacity-50 hover:opacity-100" />
    </button>
  );
};

export default function HelpersTabContent() {
  const [helpers, setHelpers] = useState<HelperData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subTab, setSubTab] = useState("all");

  useEffect(() => {
    fetchHelpers();
    // Pkg93: replaced dead postgres_changes (topup_helpers NOT in supabase_realtime
    // publication → silent no-op). Pkg37 admin_broadcast trigger now fires
    // `admin-table-update` window event for topup_helpers row changes.
    const onAdminUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { table?: string } | undefined;
      if (detail?.table === 'topup_helpers') fetchHelpers();
    };
    // Pkg360 NO-AUTO-REFRESH: removed visibilitychange refetch — admin-table-update push covers updates.
    window.addEventListener('admin-table-update', onAdminUpdate);
    return () => {
      window.removeEventListener('admin-table-update', onAdminUpdate);
    };
  }, []);



  const fetchHelpers = async () => {
    setLoading(true);
    
    // Fetch helpers and agency mappings in parallel
    const [helpersRes, agencyHostsRes] = await Promise.all([
      supabase
        .from("topup_helpers")
        .select(`*, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, is_online, country_code, country_flag, country_name)`)
        .order("created_at", { ascending: false }),
      supabase
        .from("agency_hosts")
        .select("host_id, agency:agencies!agency_hosts_agency_id_fkey(agency_code)")
        .eq("status", "active")
    ]);

    const helperData = helpersRes.data || [];
    const agencyHosts = agencyHostsRes.data || [];

    // Build user_id -> agency_code map
    const agencyCodeMap: Record<string, string> = {};
    agencyHosts.forEach((ah: any) => {
      if (ah.agency?.agency_code) {
        agencyCodeMap[ah.host_id] = ah.agency.agency_code;
      }
    });

    // Attach agency_code to each helper
    const enriched = helperData.map((h: any) => ({
      ...h,
      agency_code: agencyCodeMap[h.user_id] || null,
    }));

    setHelpers(enriched);
    setLoading(false);
  };

  const filtered = helpers.filter((h) => {
    if (subTab === "payroll" && !h.payroll_enabled) return false;
    if (subTab === "regular" && h.payroll_enabled) return false;
    if (subTab === "active" && !h.is_active) return false;
    if (subTab === "inactive" && h.is_active) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = h.user?.display_name?.toLowerCase() || "";
      const uid = h.user?.app_uid?.toLowerCase() || "";
      const code = h.agency_code?.toLowerCase() || "";
      return name.includes(q) || uid.includes(q) || code.includes(q);
    }
    return true;
  });

  const payrollCount = helpers.filter((h) => h.payroll_enabled).length;
  const regularCount = helpers.filter((h) => !h.payroll_enabled).length;
  const activeCount = helpers.filter((h) => h.is_active).length;
  const inactiveCount = helpers.filter((h) => !h.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-amber-500/10 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <Users className="w-6 h-6 mx-auto mb-1 text-amber-400" />
            <p className="text-xl font-bold text-foreground">{helpers.length}</p>
            <p className="text-xs text-muted-foreground">Total Helpers</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-3 text-center">
            <Shield className="w-6 h-6 mx-auto mb-1 text-green-400" />
            <p className="text-xl font-bold text-foreground">{payrollCount}</p>
            <p className="text-xs text-muted-foreground">Payroll Helpers</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-3 text-center">
            <Headphones className="w-6 h-6 mx-auto mb-1 text-blue-400" />
            <p className="text-xl font-bold text-foreground">{regularCount}</p>
            <p className="text-xs text-muted-foreground">Regular Helpers</p>
          </CardContent>
        </Card>
        <Card className="bg-pink-500/10 border-pink-500/20">
          <CardContent className="p-3 text-center">
            <CircleDot className="w-6 h-6 mx-auto mb-1 text-pink-400" />
            <p className="text-xl font-bold text-foreground">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Now</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub Tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-slate-800 border border-slate-700 p-1">
          <TabsTrigger value="all" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-xs">
            All ({helpers.length})
          </TabsTrigger>
          <TabsTrigger value="payroll" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-xs">
            Payroll ({payrollCount})
          </TabsTrigger>
          <TabsTrigger value="regular" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
            Regular ({regularCount})
          </TabsTrigger>
          <TabsTrigger value="active" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs">
            Active ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-xs">
            Inactive ({inactiveCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, UID, or Agency Code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white/5 border-white/10 text-white"
        />
      </div>

      {/* Helper List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((helper) => (
          <Card key={helper.id} className="bg-white/5 border-white/10 hover:border-amber-500/30 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={helper.user?.avatar_url || ""} />
                    <AvatarFallback className="bg-amber-600 text-white text-sm">
                      {(helper.user?.display_name || "H")[0]}
                    </AvatarFallback>
                  </Avatar>
                  {helper.user?.is_online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {helper.user?.display_name || "Unknown"}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <CopyableUid value={helper.user?.app_uid} fallback="No UID" />
                  </div>
                  {helper.agency_code && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-400/70">
                      <span>Agency: {helper.agency_code}</span>
                      <CopyButton value={helper.agency_code} label="Agency Code" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {helper.payroll_enabled ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                      Payroll
                    </Badge>
                  ) : (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                      Regular
                    </Badge>
                  )}
                  <Badge className={`text-[10px] ${helper.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                    {helper.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/5 rounded-lg p-2">
                  <Wallet className="w-3.5 h-3.5 mx-auto mb-0.5 text-amber-400" />
                  <p className="text-xs font-bold text-white">{(helper.wallet_balance || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-white/40">Wallet</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <DollarSign className="w-3.5 h-3.5 mx-auto mb-0.5 text-green-400" />
                  <p className="text-xs font-bold text-white">{(helper.total_earnings || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-white/40">Earnings</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <CircleDot className="w-3.5 h-3.5 mx-auto mb-0.5 text-purple-400" />
                  <p className="text-xs font-bold text-white">Lv.{helper.trader_level || 1}</p>
                  <p className="text-[10px] text-white/40">Level</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                {helper.user?.country_flag ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{helper.user.country_flag}</span>
                    <span className="text-[10px] text-white/50">{helper.user.country_name || helper.user.country_code || helper.country_code}</span>
                  </div>
                ) : helper.country_code ? (
                  <span className="text-[10px] text-white/30">🌍 {helper.country_code}</span>
                ) : (
                  <span />
                )}
                <span className="text-[10px] text-white/30">{helper.commission_rate || 0}% commission</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <Headphones className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No helpers found</p>
        </div>
      )}
    </div>
  );
}
