import { useState, useEffect, useCallback, useRef } from "react";
import useAdminRealtime, { dispatchAdminTableUpdate } from "@/hooks/useAdminRealtime";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  Search, 
  User, 
  Building2, 
  Crown, 
  Wallet, 
  Minus, 
  Plus,
  Ban, 
  AlertTriangle,
  Check,
  Loader2,
  Gem,
  Diamond,
  Users,
  Bell,
  Phone,
  Clock,
  X,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { toast } from "sonner";
import { adminStyles, gradients, iconBgColors } from "@/styles/adminStyles";
import { motion, AnimatePresence } from "framer-motion";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface SearchResult {
  type: 'user' | 'host' | 'agency' | 'helper';
  id: string;
  uid?: string;
  name: string;
  avatar?: string;
  isBlocked?: boolean;
  balances: {
    diamonds?: number;
    beans?: number;
    pending_earnings?: number;
    total_earnings?: number;
    wallet_balance?: number;
  };
  agencyId?: string;
  helperId?: string;
  // New: Related accounts for unified view
  relatedAgency?: {
    id: string;
    name: string;
    beans_balance: number;
    diamond_balance: number;
  };
  relatedHelper?: {
    id: string;
    wallet_balance: number;
    total_earnings: number;
    level: number;
  };
}

interface PhoneAlert {
  id: string;
  userId: string;
  detectedContent: string;
  contextType: string;
  callerName?: string;
  timestamp: string;
  violationResult?: {
    violation_count: number;
    action_taken: string;
    is_banned?: boolean;
    beans_deducted?: number;
    previous_balance?: number;
    new_balance?: number;
    is_host?: boolean;
  };
  userProfile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
  autoDeducted?: boolean;
  deductedAmount?: number;
  newBalance?: number;
  isHost?: boolean;
}

export default function AdminBalanceDeduction() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<'all' | 'user' | 'agency' | 'helper'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  
  // Deduction state
  const [deductionField, setDeductionField] = useState<string>("");
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");
  const [isDeducting, setIsDeducting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Block state
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [isBlocking, setIsBlocking] = useState(false);
  
  // Add/Restore balance state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addField, setAddField] = useState<string>("");
  const [addAmount, setAddAmount] = useState("");
  const [addReason, setAddReason] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  
  // Phone alerts state
  const [phoneAlerts, setPhoneAlerts] = useState<PhoneAlert[]>([]);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  // Fetch user profile for an alert
  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, app_uid')
      .eq('id', userId)
      .maybeSingle();
    return data;
  }, []);

  // Load recent phone alerts
  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('type', 'phone_detection_alert')
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      // Batch fetch all violator profiles in one query
      const violatorIds = [...new Set(data.map(n => (n.data as any)?.violator_id).filter(Boolean))];
      const { data: profiles } = violatorIds.length > 0 ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid')
        .in('id', violatorIds) : { data: [] };
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      
      const alertsWithProfiles = data.map(notif => {
        const alertData = notif.data as any;
        return {
          id: notif.id,
          userId: alertData?.violator_id,
          detectedContent: alertData?.detected_content,
          contextType: alertData?.context_type,
          callerName: alertData?.caller_name,
          timestamp: notif.created_at,
          violationResult: alertData?.violation_result,
          userProfile: profileMap.get(alertData?.violator_id) || undefined,
        } as PhoneAlert;
      });
      setPhoneAlerts(alertsWithProfiles);
      setUnreadAlertCount(alertsWithProfiles.length);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useAdminRealtime(['notifications'], () => {
    void loadAlerts();
  });

  // Handle quick action from alert
  const handleAlertQuickAction = async (alert: PhoneAlert) => {
    // Search for the user
    setSearchQuery(alert.userProfile?.app_uid || alert.userId);
    setSearchType('user');
    setShowAlertsPanel(false);
    
    // Auto search after setting query
    setTimeout(() => {
      handleSearch();
    }, 100);
  };

  // Quick ban from alert
  const handleQuickBan = async (alert: PhoneAlert) => {
    try {
      const { data, error } = await supabase.rpc('admin_block_user', {
        _user_id: alert.userId,
        _block: true,
        _reason: `Phone number sharing: ${alert.detectedContent}`,
        _ban_device: false,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Failed to ban user');
      
      // Log the admin action
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'user_blocked',
        target_type: 'user',
        target_id: alert.userId,
        details: {
          reason: `Phone number sharing: ${alert.detectedContent}`,
          uid: alert.userProfile?.app_uid,
          auto_action: true
        }
      });
      
      toast.success('User banned successfully');
      dispatchAdminTableUpdate({ table: 'profiles', eventType: 'UPDATE' });
      
      // Update local state
      setPhoneAlerts(prev => prev.map(a => 
        a.id === alert.id
          ? { ...a, violationResult: { ...a.violationResult!, is_banned: true, action_taken: 'manual_ban' } }
          : a
      ));
    } catch (error) {
      toast.error('Failed to ban user');
    }
  };

  const formatAlertTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return date.toLocaleDateString('en-US');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter UID");
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const searchResults: SearchResult[] = [];
      const trimmedQuery = searchQuery.trim();

      // Search users/hosts by app_uid - try exact match first, then partial
      if (searchType === 'all' || searchType === 'user') {
        let profiles: any[] = [];
        
        // First try exact match on app_uid (cast to text for comparison)
        const { data: exactProfiles, error: exactError } = await supabase
          .from('profiles')
          .select('id, app_uid, display_name, avatar_url, is_host, is_blocked, diamonds, total_earnings, pending_earnings')
          .eq('app_uid', trimmedQuery)
          .limit(10);
        
        console.log('[Search] Exact match result:', exactProfiles, 'Error:', exactError);
        
        if (exactProfiles && exactProfiles.length > 0) {
          profiles = exactProfiles;
        } else {
          // Try partial match with ilike
          const { data: partialProfiles, error: partialError } = await supabase
            .from('profiles')
            .select('id, app_uid, display_name, avatar_url, is_host, is_blocked, diamonds, total_earnings, pending_earnings')
            .or(`app_uid.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%`)
            .limit(10);
          
          console.log('[Search] Partial match result:', partialProfiles, 'Error:', partialError);
          
          if (partialProfiles) {
            profiles = partialProfiles;
          }
        }

        console.log('[Search] Final profiles to process:', profiles);

        if (profiles && profiles.length > 0) {
          // Batch fetch agencies and helpers for all profiles at once
          const profileIds = profiles.map(p => p.id);
          
          const [agenciesRes, helpersRes] = await Promise.all([
            supabase.from('agencies').select('id, name, beans_balance, diamond_balance, owner_id').in('owner_id', profileIds),
            supabase.from('topup_helpers').select('id, wallet_balance, total_earnings, trader_level, user_id').in('user_id', profileIds)
          ]);
          
          const agencyMap = new Map((agenciesRes.data || []).map(a => [a.owner_id, a]));
          const helperMap = new Map((helpersRes.data || []).map(h => [h.user_id, h]));
          
          for (const profile of profiles) {
            const agencyData = agencyMap.get(profile.id);
            const helperData = helperMap.get(profile.id);
            
            searchResults.push({
              type: profile.is_host ? 'host' : 'user',
              id: profile.id,
              uid: profile.app_uid || undefined,
              name: profile.display_name || 'Unknown',
              avatar: profile.avatar_url || undefined,
              isBlocked: profile.is_blocked || false,
              balances: {
                diamonds: profile.diamonds || 0,
                total_earnings: profile.total_earnings || 0,
                pending_earnings: profile.pending_earnings || 0
              },
              relatedAgency: agencyData ? {
                id: agencyData.id,
                name: agencyData.name,
                beans_balance: agencyData.beans_balance || 0,
                diamond_balance: agencyData.diamond_balance || 0
              } : undefined,
              relatedHelper: helperData ? {
                id: helperData.id,
                wallet_balance: helperData.wallet_balance || 0,
                total_earnings: helperData.total_earnings || 0,
                level: helperData.trader_level || 1
              } : undefined
            });
          }
        }
      }

      // Search agencies by agency_code, name, OR owner's app_uid
      if (searchType === 'all' || searchType === 'agency') {
        // First try direct agency search by code/name
        let agencies: any[] = [];
        
        const { data: directAgencies } = await supabase
          .from('agencies')
          .select('id, agency_code, name, logo_url, is_blocked, beans_balance, diamond_balance, wallet_balance, owner_id')
          .or(`agency_code.ilike.%${trimmedQuery}%,name.ilike.%${trimmedQuery}%`)
          .limit(10);
        
        if (directAgencies && directAgencies.length > 0) {
          agencies = directAgencies;
        } else {
          // Try searching by owner's app_uid - first find the user, then their agency
          const { data: ownerProfiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('app_uid', trimmedQuery)
            .limit(5);
          
          if (ownerProfiles && ownerProfiles.length > 0) {
            const ownerIds = ownerProfiles.map(p => p.id);
            const { data: ownerAgencies } = await supabase
              .from('agencies')
              .select('id, agency_code, name, logo_url, is_blocked, beans_balance, diamond_balance, wallet_balance, owner_id')
              .in('owner_id', ownerIds)
              .limit(10);
            
            if (ownerAgencies) {
              agencies = ownerAgencies;
            }
          }
        }
        
        console.log('[Search] Agency search results:', agencies?.length || 0);

        if (agencies && agencies.length > 0) {
          // Batch fetch owner profiles
          const ownerIdsForUid = agencies.map(a => a.owner_id).filter(Boolean);
          const { data: ownerProfiles } = ownerIdsForUid.length > 0
            ? await supabase.from('profiles').select('id, app_uid').in('id', ownerIdsForUid)
            : { data: [] };
          const ownerUidMap = new Map((ownerProfiles || []).map(p => [p.id, p.app_uid]));
          
          for (const agency of agencies) {
            const ownerUid = ownerUidMap.get(agency.owner_id) || agency.agency_code;
            
            searchResults.push({
              type: 'agency',
              id: agency.owner_id || agency.id,
              agencyId: agency.id,
              uid: ownerUid,
              name: agency.name,
              avatar: agency.logo_url || undefined,
              isBlocked: agency.is_blocked || false,
              balances: {
                beans: agency.beans_balance || 0,
                diamonds: agency.diamond_balance || 0,
                wallet_balance: agency.wallet_balance || 0
              }
            });
          }
        }
      }

      // Search helpers by user UID
      if (searchType === 'all' || searchType === 'helper') {
        const { data: helpers } = await supabase
          .from('topup_helpers')
          .select(`
            id, 
            user_id, 
            trader_level, 
            wallet_balance, 
            total_earnings, 
            is_active,
            profiles:user_id (app_uid, display_name, avatar_url, is_blocked)
          `)
          .limit(20);

        if (helpers) {
          for (const helper of helpers) {
            const profile = (helper as any).profiles;
            if (profile && (
              profile.app_uid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
            )) {
              searchResults.push({
                type: 'helper',
                id: (helper as any).user_id,
                helperId: (helper as any).id,
                uid: profile.app_uid || undefined,
                name: `${profile.display_name || 'Unknown'} (Level ${(helper as any).trader_level || 1})`,
                avatar: profile.avatar_url || undefined,
                isBlocked: !(helper as any).is_active || profile.is_blocked,
                balances: {
                  wallet_balance: (helper as any).wallet_balance || 0,
                  total_earnings: (helper as any).total_earnings || 0
                }
              });
            }
          }
        }
      }

      setResults(searchResults);
      
      if (searchResults.length === 0) {
        toast.info("No results found");
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminBalanceDeduction.SearchError", message: formatAdminError(error)});
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'user': return 'User';
      case 'host': return 'Host';
      case 'agency': return 'Agency';
      case 'helper': return 'Helper';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'user': return <User className="w-4 h-4" />;
      case 'host': return <Crown className="w-4 h-4" />;
      case 'agency': return <Building2 className="w-4 h-4" />;
      case 'helper': return <Wallet className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const getBalanceFields = (result: SearchResult) => {
    const fields: { key: string; label: string; value: number; icon: React.ReactNode; source: 'user' | 'agency' | 'helper' }[] = [];
    
    if (result.type === 'user' || result.type === 'host') {
      // User's diamonds
      fields.push({ key: 'diamonds', label: 'Diamonds', value: result.balances.diamonds || 0, icon: <Diamond className="w-4 h-4 text-blue-500" />, source: 'user' });
      if (result.type === 'host') {
        fields.push({ key: 'total_earnings', label: 'Total Earnings (Beans)', value: result.balances.total_earnings || 0, icon: <Gem className="w-4 h-4 text-amber-500" />, source: 'user' });
        fields.push({ key: 'pending_earnings', label: 'Pending Earnings', value: result.balances.pending_earnings || 0, icon: <Gem className="w-4 h-4 text-orange-500" />, source: 'user' });
      }
      
      // Related Agency balances (if user owns an agency)
      if (result.relatedAgency) {
        fields.push({ key: 'agency_beans', label: `Agency Beans (${result.relatedAgency.name})`, value: result.relatedAgency.beans_balance || 0, icon: <Building2 className="w-4 h-4 text-purple-500" />, source: 'agency' });
        fields.push({ key: 'agency_diamonds', label: `Agency Diamonds (${result.relatedAgency.name})`, value: result.relatedAgency.diamond_balance || 0, icon: <Diamond className="w-4 h-4 text-cyan-500" />, source: 'agency' });
      }
      
      // Related Helper balances (if user is a helper)
      if (result.relatedHelper) {
        fields.push({ key: 'helper_wallet', label: `Helper Wallet (L${result.relatedHelper.level})`, value: result.relatedHelper.wallet_balance || 0, icon: <Wallet className="w-4 h-4 text-green-500" />, source: 'helper' });
        fields.push({ key: 'helper_earnings', label: 'Helper Total Earnings', value: result.relatedHelper.total_earnings || 0, icon: <Gem className="w-4 h-4 text-emerald-500" />, source: 'helper' });
      }
    } else if (result.type === 'agency') {
      fields.push({ key: 'beans', label: 'Beans Balance', value: result.balances.beans || 0, icon: <Gem className="w-4 h-4 text-amber-500" />, source: 'agency' });
      fields.push({ key: 'diamonds', label: 'Diamond Balance', value: result.balances.diamonds || 0, icon: <Diamond className="w-4 h-4 text-blue-500" />, source: 'agency' });
      fields.push({ key: 'wallet_balance', label: 'Wallet Balance', value: result.balances.wallet_balance || 0, icon: <Wallet className="w-4 h-4 text-green-500" />, source: 'agency' });
    } else if (result.type === 'helper') {
      fields.push({ key: 'wallet_balance', label: 'Wallet Balance', value: result.balances.wallet_balance || 0, icon: <Wallet className="w-4 h-4 text-green-500" />, source: 'helper' });
      fields.push({ key: 'total_earnings', label: 'Total Earnings', value: result.balances.total_earnings || 0, icon: <Gem className="w-4 h-4 text-amber-500" />, source: 'helper' });
    }
    
    return fields;
  };

  const handleDeductClick = (field: string) => {
    setDeductionField(field);
    setDeductionAmount("");
    setDeductionReason("");
    setShowConfirmDialog(true);
  };

  const handleAddClick = (field: string) => {
    setAddField(field);
    setAddAmount("");
    setAddReason("");
    setShowAddDialog(true);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Pkg360: Unified add/deduct via `admin_adjust_balance` RPC.
  // The old code did direct `.update()` on `profiles` / `topup_helpers`, which
  // was silently rejected by `protect_sensitive_profile_columns` (Pkg338) +
  // by the absent client write policy on `topup_helpers`. Everything now goes
  // through ONE SECURITY DEFINER RPC that bypasses the trigger, audit-logs,
  // and returns the new balance so the UI can refresh instantly.
  // ─────────────────────────────────────────────────────────────────────────────
  const adjustBalance = async (
    addOrDeduct: 'add' | 'deduct',
    fieldKey: string,
    amount: number,
    reason: string,
  ): Promise<{ ok: boolean; error?: string; newBalance?: number }> => {
    if (!selectedResult) return { ok: false, error: 'No selection' };

    // Route to (target_type, target_id, db_field) by the UI field key.
    let target_type: 'profile' | 'helper' | 'agency';
    let target_id: string;
    let db_field: string;

    // Related agency on a user/host row
    if (fieldKey.startsWith('agency_') && selectedResult.relatedAgency) {
      target_type = 'agency';
      target_id = selectedResult.relatedAgency.id;
      db_field = fieldKey === 'agency_beans' ? 'beans_balance' : 'diamond_balance';
    }
    // Related helper on a user/host row
    else if (fieldKey.startsWith('helper_') && selectedResult.relatedHelper) {
      target_type = 'helper';
      target_id = selectedResult.relatedHelper.id;
      db_field = fieldKey === 'helper_wallet' ? 'wallet_balance' : 'total_earnings';
    }
    // Plain profile (user/host) — note: UI labels "diamonds" as Diamonds but the
    // underlying column is profiles.diamonds (the in-app diamonds wallet).
    else if (selectedResult.type === 'user' || selectedResult.type === 'host') {
      target_type = 'profile';
      target_id = selectedResult.id;
      const profileFieldMap: Record<string, string> = {
        diamonds: 'diamonds',
        total_earnings: 'total_earnings',
        pending_earnings: 'pending_earnings',
        beans: 'beans',
      };
      db_field = profileFieldMap[fieldKey] || fieldKey;
    }
    // Agency row searched directly
    else if (selectedResult.type === 'agency') {
      target_type = 'agency';
      target_id = selectedResult.agencyId || selectedResult.id;
      const agencyFieldMap: Record<string, string> = {
        beans: 'beans_balance',
        diamonds: 'diamond_balance',
        wallet_balance: 'wallet_balance',
      };
      db_field = agencyFieldMap[fieldKey] || fieldKey;
    }
    // Helper row searched directly
    else if (selectedResult.type === 'helper') {
      target_type = 'helper';
      target_id = selectedResult.helperId || selectedResult.id;
      db_field = fieldKey === 'wallet_balance' ? 'wallet_balance' : 'total_earnings';
    } else {
      return { ok: false, error: 'Unsupported target type' };
    }

    const delta = addOrDeduct === 'add' ? amount : -amount;

    const { data, error } = await supabase.rpc('admin_adjust_balance', {
      _target_type: target_type,
      _target_id: target_id,
      _field: db_field,
      _delta: delta,
      _reason: reason || null,
    });

    if (error) return { ok: false, error: error.message };
    const result = (data ?? {}) as { success?: boolean; error?: string; new_balance?: number };
    if (!result.success) return { ok: false, error: result.error || 'Failed' };
    return { ok: true, newBalance: result.new_balance };
  };

  const handleConfirmAdd = async () => {
    if (!selectedResult || !addField || !addAmount) {
      toast.error('Please fill all fields');
      return;
    }
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!guardStart('confirm-add')) return;
    setIsAdding(true);
    try {
      const result = await adjustBalance('add', addField, amount, addReason);
      if (!result.ok) {
        recordAdminError({
          kind: 'rpc',
          label: 'AdminBalanceDeduction.AddError',
          message: result.error || 'Unknown',
        });
        toast.error(result.error || 'Failed to add amount');
        return;
      }
      toast.success(`+${amount} added — new balance: ${result.newBalance ?? '—'}`);
      setShowAddDialog(false);
      handleSearch();
    } catch (error) {
      recordAdminError({
        kind: 'rpc',
        label: 'AdminBalanceDeduction.AddError',
        message: formatAdminError(error),
      });
      toast.error('Failed to add amount');
    } finally {
      setIsAdding(false);
      guardEnd('confirm-add');
    }
  };


  const handleConfirmDeduction = async () => {
    if (!selectedResult || !deductionField || !deductionAmount) {
      toast.error('Please fill all fields');
      return;
    }
    const amount = parseFloat(deductionAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!guardStart('confirm-deduction')) return;
    setIsDeducting(true);
    try {
      const result = await adjustBalance('deduct', deductionField, amount, deductionReason);
      if (!result.ok) {
        recordAdminError({
          kind: 'rpc',
          label: 'AdminBalanceDeduction.DeductionError',
          message: result.error || 'Unknown',
        });
        toast.error(result.error || 'Failed to deduct amount');
        return;
      }
      toast.success(`-${amount} deducted — new balance: ${result.newBalance ?? '—'}`);
      setShowConfirmDialog(false);
      handleSearch();
    } catch (error) {
      recordAdminError({
        kind: 'rpc',
        label: 'AdminBalanceDeduction.DeductionError',
        message: formatAdminError(error),
      });
      toast.error('Failed to deduct amount');
    } finally {
      setIsDeducting(false);
      guardEnd('confirm-deduction');
    }
  };


  const handleBlockUser = async () => {
    if (!selectedResult) return;
    if (!guardStart('block-user')) return;
    setIsBlocking(true);

    try {
      if (selectedResult.type === 'agency') {
        const { data, error } = await supabase.rpc('admin_block_agency', {
          _agency_id: selectedResult.agencyId,
          _block: true,
          _reason: blockReason || null,
        });
        if (error) throw error;
        if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Failed to block agency');
      } else {
        const { data, error } = await supabase.rpc('admin_block_user', {
          _user_id: selectedResult.id,
          _block: true,
          _reason: blockReason || null,
          _ban_device: false,
        });
        if (error) throw error;
        if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Failed to block user');
      }

      // Log the admin action
      const __as = getAdminSession(); const user = __as?.admin_id ? ({ id: __as.admin_id } as { id: string }) : null;
      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'user_blocked',
        target_type: selectedResult.type,
        target_id: selectedResult.id,
        details: {
          reason: blockReason,
          uid: selectedResult.uid
        }
      });

      toast.success("Blocked successfully");
      setShowBlockDialog(false);
      setBlockReason("");
      dispatchAdminTableUpdate({ table: selectedResult.type === 'agency' ? 'agencies' : 'profiles', eventType: 'UPDATE' });
      
      // Refresh search results
      handleSearch();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminBalanceDeduction.BlockError", message: formatAdminError(error)});
      toast.error("Failed to block");
    } finally {
      setIsBlocking(false);
      guardEnd('block-user');
    }
  };

  return (
    <div className={`admin-pro-shell ${adminStyles.pageContainer}`}>
      {/* Phone Alerts Panel */}
      <AnimatePresence>
        {showAlertsPanel && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-2xl z-50 flex flex-col"
          >
            {/* Panel Header */}
            <div className="p-4 border-b bg-gradient-to-r from-red-500 to-orange-500 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  <h2 className="font-bold">Phone Detection Alerts</h2>
                  {unreadAlertCount > 0 && (
                    <Badge className="bg-white text-red-500 text-xs">
                      {unreadAlertCount}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowAlertsPanel(false);
                    setUnreadAlertCount(0);
                  }}
                  className="text-slate-900 hover:bg-white/20"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Alerts List */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {phoneAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Bell className="w-12 h-12 mb-4 opacity-50" />
                    <p>No alerts</p>
                  </div>
                ) : (
                  phoneAlerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className={`p-3 ${alert.violationResult?.is_banned ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10 border-2 border-red-300">
                            <UserAvatarImage seed={(((alert.userProfile) as any)?.id ?? ((alert.userProfile) as any)?.user_id ?? ((alert.userProfile) as any)?.host_id)} gender={((alert.userProfile) as any)?.gender} src={alert.userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-red-500 text-white">
                              <User className="w-5 h-5" />
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">
                                {alert.userProfile?.display_name || alert.callerName || 'Unknown'}
                              </span>
                              {alert.userProfile?.app_uid && (
                                <span className="text-xs text-muted-foreground">
                                  #{alert.userProfile.app_uid}
                                </span>
                              )}
                              {alert.violationResult?.is_banned && (
                                <Badge className="bg-red-500 text-white text-xs">
                                  <Ban className="w-3 h-3 mr-1" />
                                  Banned
                                </Badge>
                              )}
                              {alert.isHost && (
                                <Badge className="bg-purple-500 text-white text-xs">
                                  Host
                                </Badge>
                              )}
                            </div>
                            
                            {/* Auto Deduction Info */}
                            {(alert.autoDeducted || alert.violationResult?.beans_deducted) && (
                              <div className="mt-1 p-2 bg-green-50 rounded border border-green-200">
                                <p className="text-sm text-green-700 font-bold flex items-center gap-1">
                                  ✅ Auto Deduction: {alert.deductedAmount || alert.violationResult?.beans_deducted || 2000} beans deducted
                                </p>
                                {(alert.newBalance !== undefined || alert.violationResult?.new_balance !== undefined) && (
                                  <p className="text-xs text-green-600">
                                    Current Balance: {(alert.newBalance ?? alert.violationResult?.new_balance)?.toLocaleString()} beans
                                  </p>
                                )}
                              </div>
                            )}
                            
                            <div className="mt-1 p-2 bg-background rounded border border-red-200">
                              <p className="text-sm text-red-600 font-medium flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {alert.detectedContent}
                              </p>
                            </div>
                            
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {formatAlertTime(alert.timestamp)}
                                {alert.contextType === 'video_call' && (
                                  <Badge className="bg-purple-100 text-purple-600 text-xs">Video Call</Badge>
                                )}
                                {alert.contextType === 'chat' && (
                                  <Badge className="bg-blue-100 text-blue-600 text-xs">Chat</Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* Quick Actions */}
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAlertQuickAction(alert)}
                                className="h-7 text-xs flex-1"
                              >
                                <Search className="w-3 h-3 mr-1" />
                                Deduct
                              </Button>
                              {!alert.violationResult?.is_banned && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleQuickBan(alert)}
                                  className="h-7 text-xs"
                                >
                                  <Ban className="w-3 h-3 mr-1" />
                                  Ban
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className={adminStyles.card}>
        <div className={`${adminStyles.headerGradient(gradients.red)} rounded-xl p-4 sm:p-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`${iconBgColors.red} p-3 rounded-xl`}>
                <Minus className="w-6 h-6" />
              </div>
              <div>
                <h1 className={adminStyles.headerTitleWhite}>Balance Deduction</h1>
                <p className="text-slate-700 text-sm">Deduct balance from users, hosts, agencies and helpers</p>
              </div>
            </div>
            
            {/* Alert Bell Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowAlertsPanel(true);
                setUnreadAlertCount(0);
              }}
              className="relative text-slate-900 hover:bg-white/20"
            >
              <Bell className="w-6 h-6" />
              {unreadAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-red-500 text-xs rounded-full flex items-center justify-center animate-pulse font-bold">
                  {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5 text-primary" />
            Search by UID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Type Tabs */}
          <Tabs value={searchType} onValueChange={(v) => setSearchType(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="user">User/Host</TabsTrigger>
              <TabsTrigger value="agency">Agency</TabsTrigger>
              <TabsTrigger value="helper">Helper</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter UID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Search Results ({results.length})
          </h3>
          
          <div className="grid gap-4">
            {results.map((result, index) => (
              <Card 
                key={`${result.type}-${result.id}-${index}`}
                className={`border-0 shadow-md cursor-pointer transition-all hover:shadow-lg ${
                  selectedResult?.id === result.id && selectedResult?.type === result.type 
                    ? 'ring-2 ring-primary' 
                    : ''
                }`}
                onClick={() => setSelectedResult(result)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                        {result.avatar ? (
                          <SmartImage src={result.avatar} alt="" className="w-full h-full object-cover" fallbackSrc="/placeholder.svg" />
                        ) : (
                          getTypeIcon(result.type)
                        )}
                      </div>
                      {result.isBlocked && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <Ban className="w-3 h-3 text-slate-900" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold truncate">{result.name}</h4>
                        <Badge variant={
                          result.type === 'host' ? 'default' :
                          result.type === 'agency' ? 'secondary' :
                          result.type === 'helper' ? 'outline' : 'secondary'
                        } className="text-xs">
                          {getTypeLabel(result.type)}
                        </Badge>
                        {result.isBlocked && (
                          <Badge variant="destructive" className="text-xs">Blocked</Badge>
                        )}
                      </div>
                      {result.uid && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          UID: <span className="font-mono">{result.uid}</span>
                        </p>
                      )}

                      {/* Balances */}
                      <div className="flex flex-wrap gap-3 mt-3">
                        {getBalanceFields(result).map((field) => (
                          <div key={field.key} className="flex items-center gap-1.5 bg-muted/50 px-2.5 py-1.5 rounded-lg">
                            {field.icon}
                            <span className="text-xs text-muted-foreground">{field.label}:</span>
                            <span className="text-sm font-semibold">{field.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Select indicator */}
                    {selectedResult?.id === result.id && selectedResult?.type === result.type && (
                      <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Selected Result Actions */}
      {selectedResult && (
        <Card className="border-0 shadow-lg bg-gradient-to-br from-background to-muted/30">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Take Action: {selectedResult.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add/Restore Balance Fields */}
            <div>
              <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-green-500" />
                Add Balance (Restore)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {getBalanceFields(selectedResult).map((field) => (
                  <Button
                    key={`add-${field.key}`}
                    variant="outline"
                    className="justify-start gap-2 h-auto py-3 border-green-200 hover:border-green-400 hover:bg-green-50"
                    onClick={() => handleAddClick(field.key)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {field.icon}
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">{field.label}</p>
                        <p className="font-semibold">{field.value.toLocaleString()}</p>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-green-500" />
                  </Button>
                ))}
              </div>
            </div>

            {/* Deduction Fields */}
            <div className="pt-4 border-t">
              <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
                <Minus className="w-4 h-4 text-red-500" />
                Deduct Balance
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {getBalanceFields(selectedResult).map((field) => (
                  <Button
                    key={`deduct-${field.key}`}
                    variant="outline"
                    className="justify-start gap-2 h-auto py-3 border-red-200 hover:border-red-400 hover:bg-red-50"
                    onClick={() => handleDeductClick(field.key)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {field.icon}
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">{field.label}</p>
                        <p className="font-semibold">{field.value.toLocaleString()}</p>
                      </div>
                    </div>
                    <Minus className="w-4 h-4 text-red-500" />
                  </Button>
                ))}
              </div>
            </div>

            {/* Block Button */}
            {!selectedResult.isBlocked && (
              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => setShowBlockDialog(true)}
                >
                  <Ban className="w-4 h-4" />
                  Block this {getTypeLabel(selectedResult.type)}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deduction Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="w-5 h-5 text-red-500" />
              Deduct Balance
            </DialogTitle>
            <DialogDescription>
              Fill in the details below to deduct from {selectedResult?.name}'s balance.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="Amount to deduct"
                value={deductionAmount}
                onChange={(e) => setDeductionAmount(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea
                placeholder="Enter reason for deduction..."
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDeduction}
              disabled={isDeducting || !deductionAmount}
            >
              {isDeducting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Minus className="w-4 h-4 mr-2" />
              )}
              Deduct
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Restore Balance Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Plus className="w-5 h-5" />
              Add Balance (Restore)
            </DialogTitle>
            <DialogDescription>
              Fill in the details to add to {selectedResult?.name}'s balance. Use this to restore if accidentally deducted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="Amount to add"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Enter reason for adding (e.g., accidentally deducted)..."
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAdd}
              disabled={isAdding || !addAmount}
              className="bg-green-600 hover:bg-green-700"
            >
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Confirmation Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              Block User
            </DialogTitle>
            <DialogDescription>
              Block {selectedResult?.name}? This action can be undone later.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Block Reason</Label>
              <Textarea
                placeholder="Enter reason for blocking..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBlockUser}
              disabled={isBlocking}
            >
              {isBlocking ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
