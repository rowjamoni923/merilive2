import { useState, useEffect, useCallback, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  MoreVertical,
  Ban,
  CheckCircle,
  Eye,
  Edit,
  Building2,
  Users,
  Coins,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Crown,
  Settings,
  Percent,
  Save,
  UserCheck,
  Calculator,
  DollarSign,
  Phone,
  Calendar,
  Clock,
  Activity,
  ArrowLeft,
  Plus,
  Loader2,
  RefreshCw,
  Shield,
  Headphones,
  CircleDot,
  Mail
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { bn } from "date-fns/locale";
import HelpersTabContent from "@/components/admin/agency/HelpersTabContent";

import { adminSendNotification } from "@/utils/adminNotification";

interface AgencyCommissionSettings {
  agency_commission_rate: number; // % of host earnings agency gets
  sub_agent_commission_rate: number; // % of host earnings sub-agent gets
  min_weekly_income_for_bonus: number;
  tiered_rates: {
    tier1: { min: number; max: number; rate: number };
    tier2: { min: number; max: number; rate: number };
    tier3: { min: number; max: number; rate: number };
  };
  use_tiered_system: boolean;
}

interface AgencyLevelTier {
  id: string;
  level_code: string;
  level_name: string;
  min_weekly_income: number;
  max_weekly_income: number;
  commission_rate: number;
  badge_color: string;
  display_order: number;
  is_active: boolean;
}

const AGENCY_LEVEL_COLOR_OPTIONS = [
  { label: 'Bronze', value: '#CD7F32' },
  { label: 'Silver', value: '#C0C0C0' },
  { label: 'Gold', value: '#FFD700' },
  { label: 'Platinum', value: '#E5E4E2' },
  { label: 'Diamond', value: '#B9F2FF' },
] as const;

const AGENCY_LEVEL_DEFAULT_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};

const normalizeAgencyBadgeColor = (value?: string | null, levelCode?: string | null) => {
  const raw = String(value ?? '').trim();
  const normalized = raw.toLowerCase();

  if (AGENCY_LEVEL_DEFAULT_COLORS[normalized]) {
    return AGENCY_LEVEL_DEFAULT_COLORS[normalized];
  }

  const matched = AGENCY_LEVEL_COLOR_OPTIONS.find((option) => option.value.toLowerCase() === normalized);
  if (matched) {
    return matched.value;
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    return raw.toUpperCase();
  }

  return AGENCY_LEVEL_DEFAULT_COLORS[String(levelCode ?? '').toLowerCase()] ?? AGENCY_LEVEL_DEFAULT_COLORS.bronze;
};

interface Agency {
  id: string;
  name: string;
  agency_code: string;
  level: string | null;
  total_hosts: number | null;
  total_agents: number | null;
  wallet_balance: number | null;
  commission_rate: number | null;
  is_active: boolean | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  created_at: string | null;
  owner_id: string | null;
  logo_url: string | null;
  email: string | null;
  whatsapp_number: string | null;
  parent_agency_id: string | null;
  owner?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
    country_code: string | null;
    country_name: string | null;
    country_flag: string | null;
  };
  parent_agency?: {
    name: string;
    agency_code: string;
    level: string | null;
  } | null;
}

interface HostResult {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_host: boolean | null;
  is_blocked: boolean | null;
  total_earnings: number | null;
  total_call_minutes: number | null;
  total_calls_received: number | null;
  country_flag: string | null;
  created_at: string | null;
  agency_id: string | null;
}

interface AgencyInfo {
  id: string;
  name: string;
  agency_code: string;
  level: string | null;
  owner?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface AgencyHostInfo {
  joined_at: string | null;
  joined_via: string | null;
  status: string | null;
}

export default function AdminAgencies() {
  const navigate = useNavigate();
  const location = useLocation();
  const [agencies, setAgencies] = useState<Agency[]>(() => getAdminCache<Agency[]>('admin_agencies_list') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_agencies_list'));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [inactiveCount, setInactiveCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAgencies, setTotalAgencies] = useState(0);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showPayrollDialog, setShowPayrollDialog] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("agencies");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [levelTiers, setLevelTiers] = useState<AgencyLevelTier[]>([]);
  const [savingLevels, setSavingLevels] = useState(false);
  
  // Host Search state
  const [hostSearchQuery, setHostSearchQuery] = useState("");
  const [hostSearchResult, setHostSearchResult] = useState<HostResult | null>(null);
  const [hostAgency, setHostAgency] = useState<AgencyInfo | null>(null);
  const [hostAgencyInfo, setHostAgencyInfo] = useState<AgencyHostInfo | null>(null);
  const [hostSearchLoading, setHostSearchLoading] = useState(false);
  const [hostSearched, setHostSearched] = useState(false);
  
  // Manual Agency Creation state
  const [showCreateAgencyDialog, setShowCreateAgencyDialog] = useState(false);
  const [createAgencyLoading, setCreateAgencyLoading] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState("");
  const [ownerSearchLoading, setOwnerSearchLoading] = useState(false);
  const [ownerSearchResult, setOwnerSearchResult] = useState<HostResult | null>(null);
  const [newAgencyName, setNewAgencyName] = useState("");
  const [newAgencyLevel, setNewAgencyLevel] = useState("A1");
  const [newAgencyCommission, setNewAgencyCommission] = useState("2");
  
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  const isSavingRef = useRef(false);
  const hasUnsavedTierChangesRef = useRef(false);

  const [commissionSettings, setCommissionSettings] = useState<AgencyCommissionSettings>({
    agency_commission_rate: 2,
    sub_agent_commission_rate: 1,
    min_weekly_income_for_bonus: 10000,
    tiered_rates: {
      tier1: { min: 0, max: 50000, rate: 2 },
      tier2: { min: 50000, max: 200000, rate: 3 },
      tier3: { min: 200000, max: 999999999, rate: 5 }
    },
    use_tiered_system: false
  });
  
  const pageSize = 20;

  const fetchLevelTiers = useCallback(async (force = false) => {
    try {
      const { data } = await supabase
        .from("agency_level_tiers")
        .select("*")
        .order("display_order", { ascending: true });

      if (data && (force || (!isSavingRef.current && !hasUnsavedTierChangesRef.current))) {
        setLevelTiers(data.map((tier) => ({
          ...tier,
          badge_color: normalizeAgencyBadgeColor(tier.badge_color, tier.level_code),
        })));
      }
    } catch (error) {
      console.error('Error fetching level tiers:', error);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchCommissionSettings();
    fetchLevelTiers();
  }, []);

  useAdminRealtime(['agencies', 'agency_level_tiers'], () => {
    fetchAgencies();
    if (!isSavingRef.current && !hasUnsavedTierChangesRef.current) {
      fetchLevelTiers();
    }
  });

  // Fetch agencies when filters change
  useEffect(() => {
    fetchAgencies();
  }, [currentPage, filterType, searchQuery]);

  const saveLevelTiers = async () => {
    setSavingLevels(true);
    isSavingRef.current = true;
    try {
      for (const tier of levelTiers) {
        const payload = {
          level_name: tier.level_name?.trim() || tier.level_code,
          min_weekly_income: Math.max(0, Number(tier.min_weekly_income) || 0),
          max_weekly_income: Math.max(0, Number(tier.max_weekly_income) || 0),
          commission_rate: Math.max(0, Number(tier.commission_rate) || 0),
          badge_color: normalizeAgencyBadgeColor(tier.badge_color, tier.level_code),
          is_active: Boolean(tier.is_active),
          updated_at: new Date().toISOString(),
        };

        if (payload.max_weekly_income < payload.min_weekly_income) {
          throw new Error(`${tier.level_code}: max income must be greater than or equal to min income`);
        }

        const { error } = await supabase
          .from("agency_level_tiers")
          .update(payload)
          .eq("id", tier.id);
        
        if (error) throw error;
      }

      hasUnsavedTierChangesRef.current = false;
      await fetchLevelTiers(true);
      toast.success("Level settings saved");
    } catch (error: any) {
      console.error("Error saving level tiers:", error);
      toast.error(error?.message || "Failed to save");
    } finally {
      setSavingLevels(false);
      setTimeout(() => {
        isSavingRef.current = false;
      }, 500);
    }
  };

  const recalculateAllLevels = async () => {
    try {
      const { data, error } = await supabase.rpc("recalculate_all_agency_levels");
      if (error) throw error;
      toast.success(`${(data as any)?.updated_count || 0} agency levels updated`);
      fetchAgencies();
    } catch (error) {
      console.error("Error recalculating levels:", error);
      toast.error("Failed to update levels");
    }
  };

  const updateTier = (id: string, field: keyof AgencyLevelTier, value: any) => {
    hasUnsavedTierChangesRef.current = true;
    setLevelTiers(prev => prev.map(tier => 
      tier.id === id
        ? { ...tier, [field]: field === 'badge_color' ? normalizeAgencyBadgeColor(value, tier.level_code) : value }
        : tier
    ));
  };

  const fetchCommissionSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await loadAppSetting<AgencyCommissionSettings>("agency_commission_settings");

      if (data) {
        setCommissionSettings(data);
      }
    } catch (error) {
      console.error("Error fetching commission settings:", error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveCommissionSettings = async () => {
    setSavingSettings(true);
    try {
      const settingData = JSON.parse(JSON.stringify(commissionSettings));
      await saveAppSetting(
        "agency_commission_settings",
        settingData,
        "Agency & Sub-agent commission settings"
      );

      toast.success("Commission settings saved successfully");
    } catch (error) {
      console.error("Error saving commission settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchAgencies = async () => {
    if (agencies.length === 0) setLoading(true);
    try {
      // If searching, also find agencies by owner display_name or app_uid
      let ownerIds: string[] = [];
      if (searchQuery) {
        const { data: matchingOwners } = await supabase
          .from("profiles")
          .select("id")
          .or(`display_name.ilike.%${searchQuery}%,app_uid.ilike.%${searchQuery}%`);
        ownerIds = (matchingOwners || []).map(o => o.id);
      }

      // First fetch agencies without join to avoid foreign key issues
      let query = supabase
        .from("agencies")
        .select("*", { count: "exact" });

      if (filterType === "active") {
        query = query.eq("is_active", true).eq("is_blocked", false);
      } else if (filterType === "cancelled") {
        query = query.eq("is_active", false);
      }

      if (searchQuery) {
        if (ownerIds.length > 0) {
          query = query.or(`name.ilike.%${searchQuery}%,agency_code.ilike.%${searchQuery}%,owner_id.in.(${ownerIds.join(',')})`);
        } else {
          query = query.or(`name.ilike.%${searchQuery}%,agency_code.ilike.%${searchQuery}%`);
        }
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Agency query error:", error);
        throw error;
      }
      
      // ⚡ Batch fetch ALL owner profiles in ONE query instead of N+1
      const uniqueOwnerIds = [...new Set((data || []).map(a => a.owner_id).filter(Boolean))] as string[];
      let ownersMap: Record<string, any> = {};
      if (uniqueOwnerIds.length > 0) {
        const { data: owners } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, country_code, country_name, country_flag")
          .in("id", uniqueOwnerIds);
        if (owners) {
          ownersMap = Object.fromEntries(owners.map(o => [o.id, o]));
        }
      }

      // ⚡ Batch fetch ALL parent agencies in ONE query
      const uniqueParentIds = [...new Set((data || []).map(a => a.parent_agency_id).filter(Boolean))] as string[];
      let parentsMap: Record<string, any> = {};
      if (uniqueParentIds.length > 0) {
        const { data: parents } = await supabase
          .from("agencies")
          .select("id, name, agency_code, level")
          .in("id", uniqueParentIds);
        if (parents) {
          parentsMap = Object.fromEntries(parents.map(p => [p.id, p]));
        }
      }

      const agenciesWithOwners = (data || []).map(agency => ({
        ...agency,
        owner: agency.owner_id ? ownersMap[agency.owner_id] || null : null,
        parent_agency: agency.parent_agency_id ? parentsMap[agency.parent_agency_id] || null : null,
      }));
      
      setAgencies(agenciesWithOwners);
      setAdminCache('admin_agencies_list', agenciesWithOwners);
      setTotalAgencies(count || 0);
      
      // Fetch inactive count for badge
      const { count: inactiveC } = await supabase
        .from("agencies")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false);
      setInactiveCount(inactiveC || 0);
    } catch (error) {
      console.error("Error fetching agencies:", error);
      toast.error("Failed to load agencies");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAgency = async () => {
    if (!selectedAgency) return;
    if (!guardStart(`cancel-${selectedAgency.id}`)) return;
    setActionLoading(true);
    try {
      const isCancelling = selectedAgency.is_active;
      
      const { error } = await supabase
        .from("agencies")
        .update({ 
          is_active: !isCancelling,
          is_blocked: isCancelling,
          blocked_reason: isCancelling ? (cancelReason || 'Cancelled by admin') : null,
          blocked_at: isCancelling ? new Date().toISOString() : null
        })
        .eq("id", selectedAgency.id);

      if (error) throw error;
      
      // Send notification to agency owner
      if (selectedAgency.owner_id) {
        await adminSendNotification(
          selectedAgency.owner_id,
          isCancelling ? '🚫 Agency Cancelled' : '✅ Agency Activated',
          isCancelling ? `Your agency has been cancelled. Reason: ${cancelReason || 'Cancelled by admin'}` : 'Your agency has been activated successfully!',
          isCancelling ? 'agency_cancelled' : 'agency_activated'
        );
      }
      
      toast.success(isCancelling ? "Agency cancelled successfully" : "Agency activated successfully");
      setShowCancelDialog(false);
      setCancelReason("");
      fetchAgencies();
    } catch (error) {
      console.error("Error updating agency:", error);
      toast.error("Operation failed");
    } finally {
      setActionLoading(false);
      if (selectedAgency) guardEnd(`cancel-${selectedAgency.id}`);
    }
  };

  const handleUpdateLevel = async (agencyId: string, newLevel: string) => {
    if (!guardStart(`level-${agencyId}`)) return;
    try {
      const { error } = await supabase
        .from("agencies")
        .update({ level: newLevel })
        .eq("id", agencyId);

      if (error) throw error;
      toast.success("Agency level updated successfully");
      fetchAgencies();
    } catch (error) {
      console.error("Error updating level:", error);
      toast.error("Update failed");
    } finally {
      guardEnd(`level-${agencyId}`);
    }
  };

  // Host Search Function
  const handleHostSearch = async () => {
    if (!hostSearchQuery.trim()) {
      toast.error("Please enter an ID");
      return;
    }

    setHostSearchLoading(true);
    setHostSearched(true);
    setHostSearchResult(null);
    setHostAgency(null);
    setHostAgencyInfo(null);

    try {
      const trimmedQuery = hostSearchQuery.trim();
      let hostData = null;
      let hostError = null;

      // First try exact match on app_uid (for numeric UIDs)
      const { data: exactUidMatch } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_host", true)
        .eq("app_uid", trimmedQuery)
        .limit(1)
        .maybeSingle();
      
      if (exactUidMatch) {
        hostData = exactUidMatch;
      } else {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(trimmedQuery)) {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("is_host", true)
            .eq("id", trimmedQuery)
            .limit(1)
            .maybeSingle();
          hostData = data;
          hostError = error;
        } else {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("is_host", true)
            .or(`app_uid.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%,username.ilike.%${trimmedQuery}%`)
            .limit(1)
            .maybeSingle();
          hostData = data;
          hostError = error;
        }
      }

      if (hostError || !hostData) {
        toast.error("Host not found");
        setHostSearchLoading(false);
        return;
      }

      setHostSearchResult(hostData);

      if (hostData.agency_id) {
        const { data: agencyData } = await supabase
          .from("agencies")
          .select(`
            id, name, agency_code, level,
            owner:profiles!agencies_owner_id_fkey(display_name, avatar_url)
          `)
          .eq("id", hostData.agency_id)
          .maybeSingle();

        const transformedAgency = agencyData ? {
          ...agencyData,
          owner: Array.isArray(agencyData.owner) ? agencyData.owner[0] : agencyData.owner
        } : null;
        setHostAgency(transformedAgency);

        const { data: joinData } = await supabase
          .from("agency_hosts")
          .select("joined_at, joined_via, status")
          .eq("host_id", hostData.id)
          .eq("agency_id", hostData.agency_id)
          .maybeSingle();

        setHostAgencyInfo(joinData);
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Search failed");
    } finally {
      setHostSearchLoading(false);
    }
  };

  const handleHostSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleHostSearch();
    }
  };

  // Owner search for manual agency creation
  const handleOwnerSearch = async () => {
    if (!ownerSearchQuery.trim()) {
      toast.error("Please enter a User UID");
      return;
    }

    setOwnerSearchLoading(true);
    setOwnerSearchResult(null);

    try {
      const trimmedQuery = ownerSearchQuery.trim();
      let userData = null;

      // First try exact match on app_uid
      const { data: exactUidMatch } = await supabase
        .from("profiles")
        .select("*")
        .eq("app_uid", trimmedQuery)
        .limit(1)
        .maybeSingle();
      
      if (exactUidMatch) {
        userData = exactUidMatch;
      } else {
        // Try UUID match
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(trimmedQuery)) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", trimmedQuery)
            .limit(1)
            .maybeSingle();
          userData = data;
        } else {
          // Partial search
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .or(`app_uid.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%`)
            .limit(1)
            .maybeSingle();
          userData = data;
        }
      }

      if (!userData) {
        toast.error("User not found");
        return;
      }

      // Check if user already owns an agency
      const { data: existingAgency } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("owner_id", userData.id)
        .maybeSingle();

      if (existingAgency) {
        toast.error(`This user already owns agency "${existingAgency.name}"`);
        return;
      }

      setOwnerSearchResult(userData);
      // Auto-set agency name based on user's display name
      if (userData.display_name) {
        setNewAgencyName(`${userData.display_name}'s Agency`);
      }
    } catch (error) {
      console.error("Owner search error:", error);
      toast.error("Search failed");
    } finally {
      setOwnerSearchLoading(false);
    }
  };

  // Generate unique agency code
  const generateAgencyCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'AG';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Create agency manually
  const handleCreateAgency = async () => {
    if (!ownerSearchResult) {
      toast.error("Please select an owner");
      return;
    }
    if (!newAgencyName.trim()) {
      toast.error("Please enter agency name");
      return;
    }
    if (!guardStart('create-agency')) return;
    setCreateAgencyLoading(true);
    try {
      const agencyCode = generateAgencyCode();

      // Use the secure RPC which bypasses trigger protection
      const { data: rpcResult, error } = await supabase.rpc('create_agency_for_user', {
        _owner_id: ownerSearchResult.id,
        _name: newAgencyName.trim(),
        _agency_code: agencyCode,
        _level: newAgencyLevel,
        _commission_rate: parseFloat(newAgencyCommission) || 2,
      });

      if (error) throw error;

      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create agency');
      }

      toast.success(`Agency "${newAgencyName}" created successfully`);
      
      // Reset form
      setShowCreateAgencyDialog(false);
      setOwnerSearchQuery("");
      setOwnerSearchResult(null);
      setNewAgencyName("");
      setNewAgencyLevel("A1");
      setNewAgencyCommission("2");
      
      // Refresh agencies list
      fetchAgencies();
    } catch (error: any) {
      console.error("Error creating agency:", error);
      if (error.code === '23505' || error.message?.includes('code already exists')) {
        toast.error("Agency code duplicate, please try again");
      } else {
        toast.error(error.message || "Failed to create agency");
      }
    } finally {
      setCreateAgencyLoading(false);
      guardEnd('create-agency');
    }
  };

  // Make agency owner a Payroll Helper (Level 5)
  const handleMakePayrollHelper = async () => {
    if (!selectedAgency?.owner_id) {
      toast.error("Agency has no owner");
      return;
    }

    setPayrollLoading(true);
    try {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("country_code, display_name")
        .eq("id", selectedAgency.owner_id)
        .maybeSingle();

      const { data: existingHelper } = await supabase
        .from("topup_helpers")
        .select("id, payroll_enabled, trader_level")
        .eq("user_id", selectedAgency.owner_id)
        .maybeSingle();

      if (existingHelper) {
        if (existingHelper.payroll_enabled && existingHelper.trader_level === 5) {
          toast.info("Already a Payroll Helper");
          setShowPayrollDialog(false);
          setPayrollLoading(false);
          return;
        }
        const { error } = await supabase
          .from("topup_helpers")
          .update({
            trader_level: 5,
            payroll_enabled: true,
            payroll_status: "approved",
            payroll_approved_at: new Date().toISOString(),
            is_active: true,
            is_verified: true,
            country_code: ownerProfile?.country_code || null,
          })
          .eq("id", existingHelper.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("topup_helpers")
          .insert({
            user_id: selectedAgency.owner_id,
            trader_level: 5,
            payroll_enabled: true,
            payroll_status: "approved",
            payroll_approved_at: new Date().toISOString(),
            is_active: true,
            is_verified: true,
            country_code: ownerProfile?.country_code || null,
            wallet_balance: 0,
          });
        if (error) throw error;
      }

      await supabase
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", selectedAgency.owner_id);

      await adminSendNotification(selectedAgency.owner_id, "🎉 Payroll Helper Activated", `You have been promoted to Level 5 Payroll Helper for agency "${selectedAgency.name}".`, "agency_verification")

      toast.success(`${ownerProfile?.display_name || "Owner"} is now a Payroll Helper`);
      setShowPayrollDialog(false);
    } catch (error) {
      console.error("Error making payroll helper:", error);
      toast.error("Failed to assign payroll helper role");
    } finally {
      setPayrollLoading(false);
    }
  };

  // Calculate example commission
  const calculateExampleCommission = (beans: number, rate: number) => {
    return Math.floor(beans * (rate / 100));
  };

  const totalPages = Math.ceil(totalAgencies / pageSize);

  const getLevelColor = (level: string | null) => {
    switch (level) {
      case "A5": return "bg-gradient-to-r from-purple-500 to-pink-500";
      case "A4": return "bg-gradient-to-r from-gray-400 to-gray-500";
      case "A3": return "bg-gradient-to-r from-yellow-400 to-yellow-500";
      case "A2": return "bg-gradient-to-r from-gray-300 to-gray-400";
      case "A1": return "bg-gradient-to-r from-amber-600 to-amber-700";
      case "platinum": return "bg-gradient-to-r from-gray-400 to-gray-500";
      case "gold": return "bg-gradient-to-r from-yellow-400 to-yellow-500";
      case "silver": return "bg-gradient-to-r from-gray-300 to-gray-400";
      default: return "bg-gradient-to-r from-amber-600 to-amber-700";
    }
  };

  const getBadgeColorClass = (color: string) => {
    switch (color) {
      case "diamond": return "from-purple-500 to-pink-500";
      case "platinum": return "from-gray-400 to-gray-500";
      case "gold": return "from-yellow-400 to-yellow-500";
      case "silver": return "from-gray-300 to-gray-400";
      case "bronze": return "from-amber-600 to-amber-700";
      default: return "from-blue-500 to-cyan-500";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 rounded-xl md:rounded-2xl shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 md:w-7 md:h-7" />
              Agency Management
            </h1>
            <p className="text-white/80 text-sm mt-1">Total {totalAgencies} Agencies</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAgencies}
              disabled={loading}
              className="bg-white/20 hover:bg-white/30 text-white border-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={() => setShowCreateAgencyDialog(true)}
              className="bg-white/20 hover:bg-white/30 text-white border-0"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Agency
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700 mb-4 p-1 w-full grid grid-cols-5 md:flex md:w-auto">
          <TabsTrigger value="agencies" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white text-slate-400 font-medium text-xs md:text-sm">
            <Building2 className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            <span className="hidden md:inline">Agencies</span>
            <span className="md:hidden">List</span>
          </TabsTrigger>
          <TabsTrigger value="hostsearch" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white text-slate-400 font-medium text-xs md:text-sm">
            <Search className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            <span className="hidden md:inline">Host Search</span>
            <span className="md:hidden">Search</span>
          </TabsTrigger>
          <TabsTrigger value="levels" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white text-slate-400 font-medium text-xs md:text-sm">
            <Crown className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Levels
          </TabsTrigger>
          <TabsTrigger value="commission" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white text-slate-400 font-medium text-xs md:text-sm">
            <Settings className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            Commission
          </TabsTrigger>
          <TabsTrigger value="helpers" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-500 data-[state=active]:text-white text-slate-400 font-medium text-xs md:text-sm">
            <Headphones className="w-3 h-3 md:w-4 md:h-4 mr-1" />
            <span className="hidden md:inline">Helpers</span>
            <span className="md:hidden">Help</span>
          </TabsTrigger>
        </TabsList>

        {/* Agency Commission Settings Tab */}
        <TabsContent value="commission" className="space-y-6">
          {settingsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Agency Commission Card */}
              <Card className="bg-white border-slate-200 shadow-md">
                <CardHeader>
                  <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-500" />
                    Agency Commission
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Fixed Rate */}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Percent className="w-5 h-5 text-blue-500" />
                        <span className="text-slate-900 font-medium">Fixed Commission Rate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-slate-600">Tiered System</Label>
                        <Switch
                          checked={commissionSettings.use_tiered_system}
                          onCheckedChange={(checked) => 
                            setCommissionSettings(prev => ({ ...prev, use_tiered_system: checked }))
                          }
                        />
                      </div>
                    </div>

                    {!commissionSettings.use_tiered_system ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-slate-700 text-sm">Agency Commission (%)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={commissionSettings.agency_commission_rate}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                agency_commission_rate: parseFloat(e.target.value) || 0
                              }))}
                              className="bg-slate-50 border-slate-200 text-slate-900"
                            />
                            <span className="text-slate-500">%</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Agency receives this % of host earnings
                          </p>
                        </div>

                        <div className="bg-slate-100 rounded-lg p-4">
                          <p className="text-slate-600 text-sm mb-2">Example:</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Host Earnings (Beans)</span>
                              <span className="text-yellow-600 font-bold">1,000</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Commission ({commissionSettings.agency_commission_rate}%)</span>
                              <span className="text-green-600 font-bold">
                                {calculateExampleCommission(1000, commissionSettings.agency_commission_rate)}
                              </span>
                            </div>
                            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                              <span className="text-slate-900">Agency Receives</span>
                              <span className="text-blue-600 font-bold">
                                {calculateExampleCommission(1000, commissionSettings.agency_commission_rate)} Beans
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Tiered System */
                      <div className="space-y-4">
                        <p className="text-slate-600 text-sm">Commission rate based on weekly earnings:</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg">
                          <div>
                            <Label className="text-slate-700 text-xs">Tier 1 (Min)</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier1.min}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier1: { ...prev.tiered_rates.tier1, min: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Max</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier1.max}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier1: { ...prev.tiered_rates.tier1, max: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Commission %</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier1.rate}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier1: { ...prev.tiered_rates.tier1, rate: parseFloat(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded text-sm">
                              {commissionSettings.tiered_rates.tier1.rate}%
                            </div>
                          </div>
                        </div>

                        {/* Tier 2 */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div>
                            <Label className="text-slate-700 text-xs">Tier 2 (Min)</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier2.min}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier2: { ...prev.tiered_rates.tier2, min: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Max</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier2.max}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier2: { ...prev.tiered_rates.tier2, max: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Commission %</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier2.rate}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier2: { ...prev.tiered_rates.tier2, rate: parseFloat(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="bg-gray-500 text-white px-3 py-1 rounded text-sm font-medium">
                              {commissionSettings.tiered_rates.tier2.rate}%
                            </div>
                          </div>
                        </div>

                        {/* Tier 3 */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div>
                            <Label className="text-slate-700 text-xs">Tier 3 (Min)</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier3.min}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier3: { ...prev.tiered_rates.tier3, min: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Max</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier3.max}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier3: { ...prev.tiered_rates.tier3, max: parseInt(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-700 text-xs">Commission %</Label>
                            <Input
                              type="number"
                              value={commissionSettings.tiered_rates.tier3.rate}
                              onChange={(e) => setCommissionSettings(prev => ({
                                ...prev,
                                tiered_rates: {
                                  ...prev.tiered_rates,
                                  tier3: { ...prev.tiered_rates.tier3, rate: parseFloat(e.target.value) || 0 }
                                }
                              }))}
                              className="bg-white border-slate-200 text-slate-900 h-8"
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="bg-yellow-500 text-white px-3 py-1 rounded text-sm font-medium">
                              {commissionSettings.tiered_rates.tier3.rate}%
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sub-Agent Commission Card */}
              <Card className="bg-white border-slate-200 shadow-md">
                <CardHeader>
                  <CardTitle className="text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-purple-600" />
                    Sub-Agent Commission
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-700 text-sm">Sub-Agent Commission (%)</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={commissionSettings.sub_agent_commission_rate}
                            onChange={(e) => setCommissionSettings(prev => ({
                              ...prev,
                              sub_agent_commission_rate: parseFloat(e.target.value) || 0
                            }))}
                            className="bg-white border-slate-200 text-slate-900"
                          />
                          <span className="text-slate-500">%</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Sub-agent receives this % of referred host earnings
                        </p>
                      </div>

                      {/* Example Calculator */}
                      <div className="bg-slate-100 rounded-lg p-4 border border-slate-200">
                        <p className="text-slate-700 text-sm mb-2 font-medium">Example:</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Referred Host Earnings (Beans)</span>
                            <span className="text-yellow-600 font-bold">10,000</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Sub-Agent Commission ({commissionSettings.sub_agent_commission_rate}%)</span>
                            <span className="text-green-600 font-bold">
                              {calculateExampleCommission(10000, commissionSettings.sub_agent_commission_rate)}
                            </span>
                          </div>
                          <div className="border-t border-slate-300 pt-2 flex justify-between text-sm">
                            <span className="text-slate-900 font-medium">Sub-Agent Receives</span>
                            <span className="text-purple-600 font-bold">
                              {calculateExampleCommission(10000, commissionSettings.sub_agent_commission_rate)} Beans
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Calculator className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-slate-900 font-medium text-sm">Commission Calculation</p>
                        <p className="text-slate-600 text-xs mt-1">
                          When a host earns from gifts/calls:
                        </p>
                        <ul className="text-slate-600 text-xs mt-2 space-y-1 list-disc list-inside">
                          <li>Agency receives: Host earnings × {commissionSettings.agency_commission_rate}%</li>
                          <li>Sub-agent receives (if referred host): Host earnings × {commissionSettings.sub_agent_commission_rate}%</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button 
                  onClick={saveCommissionSettings}
                  disabled={savingSettings}
                  className="bg-gradient-to-r from-green-600 to-emerald-600"
                >
                  {savingSettings ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* Level System Tab */}
        <TabsContent value="levels" className="space-y-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-400" />
                  Agency Level System
                </CardTitle>
                <Button
                  onClick={recalculateAllLevels}
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/10 text-white"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Recalculate All Levels
                </Button>
              </div>
              <p className="text-white/60 text-sm">
                Agency levels and commissions auto-update based on weekly earnings
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {levelTiers.map((tier, index) => (
                <div 
                  key={tier.id}
                  className={`p-4 rounded-lg border border-white/10 bg-gradient-to-r ${getBadgeColorClass(tier.badge_color)}/10`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${getBadgeColorClass(tier.badge_color)} flex items-center justify-center text-white font-bold text-lg`}>
                        {tier.level_code}
                      </div>
                      <div>
                        <Input
                          value={tier.level_name}
                          onChange={(e) => updateTier(tier.id, "level_name", e.target.value)}
                          className="bg-white/5 border-white/10 text-white font-medium h-8 w-40"
                        />
                        <p className="text-white/50 text-xs mt-1">Level Code: {tier.level_code}</p>
                      </div>
                    </div>
                    <Switch
                      checked={tier.is_active}
                      onCheckedChange={(checked) => updateTier(tier.id, "is_active", checked)}
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-white/70 text-xs">Weekly Min Income ($)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 font-bold text-sm">$</span>
                        <Input
                          type="number"
                          value={tier.min_weekly_income}
                          onChange={(e) => updateTier(tier.id, "min_weekly_income", parseInt(e.target.value) || 0)}
                          className="bg-white/5 border-white/10 text-white h-8 pl-7"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">Weekly Max Income ($)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 font-bold text-sm">$</span>
                        <Input
                          type="number"
                          value={tier.max_weekly_income}
                          onChange={(e) => updateTier(tier.id, "max_weekly_income", parseInt(e.target.value) || 0)}
                          className="bg-white/5 border-white/10 text-white h-8 pl-7"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">Commission Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={tier.commission_rate}
                        onChange={(e) => updateTier(tier.id, "commission_rate", parseFloat(e.target.value) || 0)}
                        className="bg-white/5 border-white/10 text-white h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-white/70 text-xs">Badge Color</Label>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-8 w-8 rounded-md border border-white/10 shrink-0"
                          style={{ backgroundColor: normalizeAgencyBadgeColor(tier.badge_color, tier.level_code) }}
                        />
                        <Select
                          value={normalizeAgencyBadgeColor(tier.badge_color, tier.level_code)}
                          onValueChange={(val) => updateTier(tier.id, "badge_color", val)}
                        >
                          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AGENCY_LEVEL_COLOR_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-block h-3 w-3 rounded-full border border-border"
                                    style={{ backgroundColor: option.value }}
                                  />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Example calculation */}
                  <div className="mt-3 p-2 bg-white/5 rounded-lg">
                    <p className="text-white/50 text-xs">
                      Example: If host earns $100, agency receives{" "}
                      <span className="text-green-400 font-bold">
                        ${(100 * tier.commission_rate / 100).toFixed(2)}
                      </span>{" "}
                      ({tier.commission_rate}%)
                    </p>
                  </div>
                </div>
              ))}

              {/* Save Button */}
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={saveLevelTiers}
                  disabled={savingLevels}
                  className="bg-gradient-to-r from-green-600 to-emerald-600"
                >
                  {savingLevels ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Level Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* How it works info */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Calculator className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">How Auto Level System Works</p>
                  <ul className="text-white/60 text-xs mt-2 space-y-1 list-disc list-inside">
                    <li>Total host earnings are calculated weekly for each agency</li>
                    <li>Agency level is auto-determined based on earnings</li>
                    <li>Commission rate is set according to the level</li>
                    <li>Higher earnings = Higher level = More commission</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Host Search Tab */}
        <TabsContent value="hostsearch" className="space-y-6">
          {/* Search Box */}
          <Card className="bg-white border-slate-200 shadow-md">
            <CardContent className="p-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    placeholder="Search by Host ID (UID) or name..."
                    value={hostSearchQuery}
                    onChange={(e) => setHostSearchQuery(e.target.value)}
                    onKeyPress={handleHostSearchKeyPress}
                    className="pl-12 h-12 bg-slate-50 border-slate-200 text-slate-900 text-lg placeholder:text-slate-400"
                  />
                </div>
                <Button
                  onClick={handleHostSearch}
                  disabled={hostSearchLoading}
                  className="h-12 px-8 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white"
                >
                  {hostSearchLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Search className="w-5 h-5 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {hostSearchLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : hostSearched && !hostSearchResult ? (
            <Card className="bg-white border-slate-200 shadow-md">
              <CardContent className="flex flex-col items-center justify-center h-64 text-slate-500">
                <Users className="w-12 h-12 mb-4" />
                <p>No host found</p>
                <p className="text-sm mt-2">Try a different ID</p>
              </CardContent>
            </Card>
          ) : hostSearchResult ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Host Profile Card */}
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Avatar */}
                    <div className="text-center md:text-left">
                      <div className="relative inline-block">
                        <Avatar className="w-24 h-24 border-4 border-primary/30">
                          <AvatarImage src={hostSearchResult.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary text-3xl">
                            {hostSearchResult.display_name?.charAt(0) || "H"}
                          </AvatarFallback>
                        </Avatar>
                        {hostSearchResult.is_online && (
                          <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-3 border-slate-900" />
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-2xl font-bold text-white">
                            {hostSearchResult.display_name || hostSearchResult.username || "Unknown"}
                          </h2>
                          {hostSearchResult.is_verified && (
                            <Badge className="bg-blue-500/20 text-blue-400 gap-1">
                              <CheckCircle className="w-3 h-3" /> Verified
                            </Badge>
                          )}
                          {hostSearchResult.is_blocked && (
                            <Badge variant="destructive" className="gap-1">
                              <Ban className="w-3 h-3" /> Blocked
                            </Badge>
                          )}
                          <Badge className={hostSearchResult.is_online ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                            {hostSearchResult.is_online ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <p className="text-white/50 mt-1">{hostSearchResult.country_flag} {hostSearchResult.username}</p>
                      </div>

                      {/* Full ID */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-white/50 text-sm mb-1">Host ID (UID)</p>
                        <p className="text-white font-mono text-sm break-all">{hostSearchResult.id}</p>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                          <Coins className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                          <p className="text-white font-bold">{hostSearchResult.total_earnings?.toLocaleString() || 0}</p>
                          <p className="text-xs text-white/50">Total Earnings</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                          <Phone className="w-5 h-5 text-green-400 mx-auto mb-1" />
                          <p className="text-white font-bold">{hostSearchResult.total_calls_received || 0}</p>
                          <p className="text-xs text-white/50">Total Calls</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                          <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                          <p className="text-white font-bold">{hostSearchResult.total_call_minutes?.toLocaleString() || 0}</p>
                          <p className="text-xs text-white/50">Call Minutes</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                          <Calendar className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                          <p className="text-white font-bold text-sm">
                            {hostSearchResult.created_at ? format(new Date(hostSearchResult.created_at), "dd MMM yy") : "N/A"}
                          </p>
                          <p className="text-xs text-white/50">Joined</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Agency Info Card */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Agency Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {hostAgency ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                          <Building2 className="w-7 h-7 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-bold text-lg">{hostAgency.name}</p>
                          <p className="text-white/50">#{hostAgency.agency_code}</p>
                        </div>
                        <Badge className="bg-yellow-500/20 text-yellow-400">
                          {hostAgency.level || "A1"} Level
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/agencies/${hostAgency.id}`)}
                          className="bg-white/5 border-white/10 text-white"
                        >
                          View Agency
                        </Button>
                      </div>

                      {/* Join Details */}
                      {hostAgencyInfo && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-white/5 rounded-lg p-4">
                            <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                              <Calendar className="w-4 h-4" /> Joining Date
                            </p>
                            <p className="text-white font-medium">
                              {hostAgencyInfo.joined_at 
                                ? format(new Date(hostAgencyInfo.joined_at), "dd MMMM yyyy")
                                : "N/A"
                              }
                            </p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-4">
                            <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                              <Clock className="w-4 h-4" /> Duration
                            </p>
                            <p className="text-white font-medium">
                              {hostAgencyInfo.joined_at 
                                ? formatDistanceToNow(new Date(hostAgencyInfo.joined_at))
                                : "N/A"
                              }
                            </p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-4">
                            <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                              <UserCheck className="w-4 h-4" /> Join Method
                            </p>
                            <p className="text-white font-medium capitalize">
                              {hostAgencyInfo.joined_via || "Invitation"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Agency Owner */}
                      {hostAgency.owner && (
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                          <Crown className="w-5 h-5 text-yellow-400" />
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={hostAgency.owner.avatar_url || undefined} />
                            <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-sm">
                              {hostAgency.owner.display_name?.charAt(0) || "O"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white text-sm">{hostAgency.owner.display_name || "Unknown"}</p>
                            <p className="text-xs text-white/50">Agency Owner</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-white/50">
                      <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>This host is not associated with any agency</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </TabsContent>

        {/* Agencies List Tab */}
        <TabsContent value="agencies" className="space-y-6">
      <Card className="bg-white/5 border-white/10">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-48 bg-white/5 border-white/10 text-white">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agencies</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="cancelled">
                  Cancelled / Inactive {inactiveCount > 0 && `(${inactiveCount})`}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inactive Agencies Warning Banner */}
      {inactiveCount > 0 && filterType !== "cancelled" && (
        <div 
          className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors"
          onClick={() => setFilterType("cancelled")}
        >
          <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">
              {inactiveCount} Cancelled/Inactive agencies found
            </p>
            <p className="text-xs text-red-400/70">Click to view</p>
          </div>
          <Badge className="bg-red-500 text-white">{inactiveCount}</Badge>
        </div>
      )}

      {/* Agencies Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agencies.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="flex flex-col items-center justify-center h-64 text-white/50">
            <Building2 className="w-12 h-12 mb-4" />
            <p>No agencies found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agencies.map((agency, i) => (
            <motion.div
              key={agency.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="group relative overflow-hidden cursor-pointer border-0 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 hover:from-slate-700/80 hover:via-slate-700/60 hover:to-slate-800/80 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-emerald-500/10 ring-1 ring-white/10 hover:ring-emerald-500/30"
                onClick={() => navigate(`/admin/agencies/${agency.id}`)}
              >
                {/* Top accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${getLevelColor(agency.level)}`} />
                
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl ${getLevelColor(agency.level)} flex items-center justify-center shadow-lg ring-2 ring-white/20`}>
                        <Building2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-bold text-lg flex items-center gap-2">
                          {agency.name}
                        </p>
                        <p className="text-sm text-white/40 font-mono">#{agency.agency_code}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="text-white/40 hover:text-white hover:bg-white/10 rounded-xl">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-800 border-white/10">
                        <DropdownMenuItem 
                          className="text-white/70 hover:text-white cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgency(agency);
                            setShowDetailDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem 
                          className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgency(agency);
                            setShowPayrollDialog(true);
                          }}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make Payroll Helper
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem 
                          className={`cursor-pointer ${agency.is_active ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgency(agency);
                            setCancelReason("");
                            setShowCancelDialog(true);
                          }}
                        >
                          {agency.is_active ? (
                            <>
                              <Ban className="w-4 h-4 mr-2" />
                              Cancel Agency
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Activate Agency
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Owner Info */}
                  <div className="flex items-center gap-3 mb-3 p-3 bg-white/5 rounded-xl border border-white/5">
                    <Avatar className="w-9 h-9 ring-2 ring-yellow-500/30">
                      <AvatarImage src={agency.owner?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {agency.owner?.display_name?.charAt(0) || "O"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-400" />
                        {agency.owner?.display_name || "Unknown"}
                      </p>
                      <p className="text-xs text-white/40">
                        {agency.owner?.app_uid ? `ID: ${agency.owner.app_uid} • ` : ''}Owner
                      </p>
                    </div>
                    {agency.owner?.country_flag && (
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-lg shrink-0">
                        <span className="text-base">{agency.owner.country_flag}</span>
                        <span className="text-[10px] text-white/60 uppercase font-medium">{agency.owner.country_code || ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Contact Info */}
                  {(agency.email || agency.whatsapp_number) && (
                    <div className="mb-3 space-y-1.5">
                      {agency.email && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                          <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="text-xs text-blue-300 truncate">{agency.email}</span>
                        </div>
                      )}
                      {agency.whatsapp_number && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-lg border border-green-500/20">
                          <Phone className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          <span className="text-xs text-green-300">{agency.whatsapp_number}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Parent Agency Info */}
                  {agency.parent_agency && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                      <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-purple-400/70 uppercase tracking-wider">Parent Agency</p>
                        <p className="text-xs text-purple-300 font-medium truncate">
                          {agency.parent_agency.name} <span className="text-purple-400/60 font-mono">#{agency.parent_agency.agency_code}</span>
                        </p>
                      </div>
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                        {agency.parent_agency.level || 'A1'}
                      </Badge>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <Users className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
                      <p className="text-white font-bold">{agency.total_hosts || 0}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Hosts</p>
                    </div>
                    <div className="text-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <Coins className="w-4 h-4 text-yellow-400 mx-auto mb-1.5" />
                      <p className="text-white font-bold">{agency.wallet_balance?.toLocaleString() || 0}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Balance</p>
                    </div>
                    <div className="text-center p-3 bg-white/5 rounded-xl border border-white/5">
                      <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1.5" />
                      <p className="text-white font-bold">{agency.commission_rate || 0}%</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Commission</p>
                    </div>
                  </div>

                  {/* Level Badge & Status */}
                  <div className="mt-4 flex items-center justify-between">
                    <Badge className={`${getLevelColor(agency.level)} text-white border-0 capitalize shadow-md`}>
                      {agency.level || "Bronze"} Level
                    </Badge>
                    <Badge className={agency.is_active ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}>
                      {agency.is_active ? "Active" : "Cancelled"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="bg-white/5 border-white/10 text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-white/60 px-4">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="bg-white/5 border-white/10 text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
        </TabsContent>

        {/* Helpers Tab */}
        <TabsContent value="helpers" className="space-y-6">
          <HelpersTabContent />
        </TabsContent>
      </Tabs>

      {/* Cancel/Activate Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-slate-800 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedAgency?.is_active ? "Cancel Agency" : "Activate Agency"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Are you sure you want to {selectedAgency?.is_active ? "cancel" : "activate"} "{selectedAgency?.name}"?
            </DialogDescription>
          </DialogHeader>
          {selectedAgency?.is_active && (
            <Textarea
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="bg-white/5 border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCancelAgency}
              disabled={actionLoading}
              className={selectedAgency?.is_active ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            >
              {actionLoading ? "Processing..." : selectedAgency?.is_active ? "Cancel Agency" : "Activate Agency"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Payroll Helper Dialog */}
      <Dialog open={showPayrollDialog} onOpenChange={setShowPayrollDialog}>
        <DialogContent className="bg-slate-800 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              Make Payroll Helper
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Assign Level 5 Payroll Helper role to the owner of &quot;{selectedAgency?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          {selectedAgency?.owner && (
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
              <Avatar className="w-10 h-10 border-2 border-cyan-500/50">
                <AvatarImage src={selectedAgency.owner.avatar_url || ""} />
                <AvatarFallback className="bg-cyan-600 text-white">
                  {selectedAgency.owner.display_name?.charAt(0) || "O"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-white font-medium">{selectedAgency.owner.display_name}</p>
                <p className="text-cyan-400 text-xs">Will become Level 5 Payroll Helper</p>
              </div>
            </div>
          )}
          <div className="text-sm text-white/50 space-y-1">
            <p>• Trader Level will be set to <strong className="text-white">5</strong></p>
            <p>• Payroll will be <strong className="text-green-400">enabled</strong></p>
            <p>• Country code will be synced from profile</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPayrollDialog(false)}
              className="bg-white/5 border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMakePayrollHelper}
              disabled={payrollLoading}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {payrollLoading ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Processing...</>
              ) : (
                <><Shield className="w-4 h-4 mr-1" />Confirm</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-800 border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Agency Details</DialogTitle>
          </DialogHeader>
          {selectedAgency && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl ${getLevelColor(selectedAgency.level)} flex items-center justify-center`}>
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-lg">{selectedAgency.name}</p>
                  <p className="text-white/50">#{selectedAgency.agency_code}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Total Hosts</p>
                  <p className="text-blue-400 font-bold">{selectedAgency.total_hosts || 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Wallet Balance</p>
                  <p className="text-yellow-400 font-bold">{selectedAgency.wallet_balance?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Commission Rate</p>
                  <p className="text-green-400 font-bold">{selectedAgency.commission_rate || 0}%</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-sm">Level</p>
                  <Select 
                    value={selectedAgency.level || "A1"}
                    onValueChange={(val) => handleUpdateLevel(selectedAgency.id, val)}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A1">A1 (Bronze)</SelectItem>
                      <SelectItem value="A2">A2 (Silver)</SelectItem>
                      <SelectItem value="A3">A3 (Gold)</SelectItem>
                      <SelectItem value="A4">A4 (Platinum)</SelectItem>
                      <SelectItem value="A5">A5 (Diamond)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedAgency.blocked_reason && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-medium">Cancellation Reason:</p>
                  <p className="text-white/70 text-sm">{selectedAgency.blocked_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Agency Dialog */}
      <Dialog open={showCreateAgencyDialog} onOpenChange={setShowCreateAgencyDialog}>
        <DialogContent className="bg-slate-800 border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Create New Agency
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Manually create a new agency and assign an owner
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">Owner (Search by UID)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter user UID or name..."
                  value={ownerSearchQuery}
                  onChange={(e) => setOwnerSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleOwnerSearch()}
                  className="bg-white/5 border-white/10 text-white"
                />
                <Button
                  onClick={handleOwnerSearch}
                  disabled={ownerSearchLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {ownerSearchLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {ownerSearchResult && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border-2 border-emerald-500/50">
                    <AvatarImage src={ownerSearchResult.avatar_url || undefined} />
                    <AvatarFallback className="bg-emerald-500/20 text-emerald-400">
                      {ownerSearchResult.display_name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-white font-medium">{ownerSearchResult.display_name || "Unknown"}</p>
                    <p className="text-white/50 text-sm">UID: {ownerSearchResult.username || ownerSearchResult.id?.slice(0, 8)}</p>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Selected
                  </Badge>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-white">Agency Name</Label>
              <Input
                placeholder="Enter agency name..."
                value={newAgencyName}
                onChange={(e) => setNewAgencyName(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white">Level</Label>
                <Select value={newAgencyLevel} onValueChange={setNewAgencyLevel}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A1">A1 (Bronze)</SelectItem>
                    <SelectItem value="A2">A2 (Silver)</SelectItem>
                    <SelectItem value="A3">A3 (Gold)</SelectItem>
                    <SelectItem value="A4">A4 (Platinum)</SelectItem>
                    <SelectItem value="A5">A5 (Diamond)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Commission Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newAgencyCommission}
                  onChange={(e) => setNewAgencyCommission(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateAgencyDialog(false);
                setOwnerSearchQuery("");
                setOwnerSearchResult(null);
                setNewAgencyName("");
              }}
              className="bg-white/5 border-white/10 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAgency}
              disabled={!ownerSearchResult || !newAgencyName.trim() || createAgencyLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createAgencyLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Agency
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
