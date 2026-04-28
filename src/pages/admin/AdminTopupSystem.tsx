import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, Coins, Send, User, Check, History,
  Diamond, Sparkles, Users, Clock, MoreVertical, Eye, Ban,
  ArrowUpRight, ArrowDownLeft, Loader2, DollarSign, Settings,
  CreditCard, Smartphone, Plus, X, Package, Filter, RefreshCw,
  TrendingUp, Download, Award, Star, Crown, Shield, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

import { adminSendNotification } from "@/utils/adminNotification";

// Interfaces
interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string;
  app_uid: string;
  coins: number;
  is_host: boolean;
  is_verified: boolean;
}

interface TopupLog {
  id: string;
  created_at: string;
  action_type: string;
  target_id: string;
  details: {
    amount: number;
    note: string;
    previous_balance: number;
    new_balance: number;
  };
  user?: { display_name: string; avatar_url: string; app_uid: string };
}

interface Helper {
  id: string;
  user_id: string;
  is_active: boolean;
  is_verified: boolean;
  wallet_balance: number;
  total_bought: number;
  trader_level: number;
  payroll_enabled: boolean;
  payment_credentials: any;
  created_at: string;
  user?: { display_name: string; avatar_url: string; app_uid: string; is_online: boolean };
}

interface HelperOrder {
  id: string;
  helper_id: string;
  user_id: string;
  coin_amount: number;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  payment_method: string;
  status: string;
  created_at: string;
  user?: { display_name: string; avatar_url: string; app_uid: string };
  helper?: { id: string; user: { display_name: string; avatar_url: string } };
}

interface Transaction {
  id: string;
  helper_id: string;
  transaction_type: string;
  coin_amount: number;
  usd_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  helper?: { user: { display_name: string; avatar_url: string; app_uid: string } };
}

interface LevelTier {
  id: string;
  level_number: number;
  level_name: string;
  upgrade_cost_usd: number;
  min_withdrawal_amount: number;
  max_withdrawal_amount: number;
  commission_rate: number;
  badge_color: string;
  description: string;
  is_active: boolean;
  benefits?: any;
}

const LEVEL_COLORS: { [key: number]: string } = {
  1: 'from-slate-400 to-slate-500',
  2: 'from-emerald-400 to-emerald-600',
  3: 'from-blue-400 to-blue-600',
  4: 'from-purple-400 to-purple-600',
  5: 'from-amber-400 to-amber-600'
};

const LEVEL_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

const DEFAULT_LEVEL_TIERS: LevelTier[] = [
  { id: 'temp-1', level_number: 1, level_name: 'Bronze Trader', upgrade_cost_usd: 0, min_withdrawal_amount: 0, max_withdrawal_amount: 0, commission_rate: 0, badge_color: '#94A3B8', description: 'Entry level helper access', is_active: true },
  { id: 'temp-2', level_number: 2, level_name: 'Silver Trader', upgrade_cost_usd: 25, min_withdrawal_amount: 0, max_withdrawal_amount: 0, commission_rate: 2, badge_color: '#10B981', description: 'Improved pricing and transfer access', is_active: true },
  { id: 'temp-3', level_number: 3, level_name: 'Gold Trader', upgrade_cost_usd: 50, min_withdrawal_amount: 0, max_withdrawal_amount: 0, commission_rate: 4, badge_color: '#3B82F6', description: 'Higher commission and larger limits', is_active: true },
  { id: 'temp-4', level_number: 4, level_name: 'Platinum Trader', upgrade_cost_usd: 100, min_withdrawal_amount: 0, max_withdrawal_amount: 0, commission_rate: 6, badge_color: '#8B5CF6', description: 'Advanced helper privileges', is_active: true },
  { id: 'temp-5', level_number: 5, level_name: 'Diamond Trader', upgrade_cost_usd: 200, min_withdrawal_amount: 0, max_withdrawal_amount: 0, commission_rate: 8, badge_color: '#F59E0B', description: 'Payroll helper access', is_active: true },
];

const getTierDescription = (benefits: any) => {
  if (!benefits) return '';
  if (typeof benefits === 'string') return benefits;
  if (typeof benefits === 'object' && typeof benefits.description === 'string') return benefits.description;
  return '';
};

const normalizeLevelTier = (tier: any): LevelTier => ({
  ...tier,
  description: getTierDescription(tier?.benefits),
});

const AdminTopupSystem = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState("manual");
  
  // Manual Topup State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recentTopups, setRecentTopups] = useState<TopupLog[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Debounce timer ref for auto-search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Traders State
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [helperSearchQuery, setHelperSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserForHelper, setSelectedUserForHelper] = useState<any>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [addingHelper, setAddingHelper] = useState(false);
  
  // Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedHelper, setSelectedHelper] = useState<Helper | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Level Upgrade Modal
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [levelUpHelper, setLevelUpHelper] = useState<Helper | null>(null);
  const [newLevel, setNewLevel] = useState(1);
  const [upgradingLevel, setUpgradingLevel] = useState(false);
  
  // Orders & Transactions
  const [orders, setOrders] = useState<HelperOrder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  
  // Level Tiers State
  const [levelTiers, setLevelTiers] = useState<LevelTier[]>([]);
  const [editingTier, setEditingTier] = useState<LevelTier | null>(null);
  const [showEditTierModal, setShowEditTierModal] = useState(false);
  const [savingTier, setSavingTier] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({
    totalHelpers: 0,
    activeHelpers: 0,
    pendingOrders: 0,
    totalCoinsTraded: 0,
    totalManualTopups: 0
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  // Auto-search with debounce when searchQuery changes
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Don't search if query is empty or user is already selected
    if (!searchQuery.trim() || selectedUser) {
      if (!searchQuery.trim()) {
        setSearchResults([]);
      }
      return;
    }
    
    // Debounce: wait 300ms after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery.trim());
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, selectedUser]);

  const loadAllData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    await Promise.all([
      fetchHelpers(),
      loadRecentTopups(),
      fetchOrders(),
      fetchTransactions(),
      fetchLevelTiers()
    ]);
    if (showSpinner) setLoading(false);
  };

  // 🔇 Silent realtime refresh — no spinner flicker, no profiles flood, debounced 1.5s
  // ❌ Removed 'profiles' (high-traffic, irrelevant) → was causing per-second refresh
  useAdminRealtime(
    ['helper_topup_requests', 'recharge_transactions', 'coin_transactions'],
    () => loadAllData(false),
    'admin-topup-rt',
    { debounceMs: 1500 }
  , { enableRealtimeRefresh: true });

  // Fetch Level Tiers
  const fetchLevelTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('trader_level_tiers')
        .select('*')
        .order('level_number', { ascending: true });
      if (!error && data) {
        setLevelTiers(data.length > 0 ? data.map(normalizeLevelTier) : DEFAULT_LEVEL_TIERS);
      }
    } catch (error) {
      console.error('Error fetching level tiers:', error);
      setLevelTiers(DEFAULT_LEVEL_TIERS);
    }
  };

  // Save Level Tier
  const handleSaveTier = async () => {
    if (!editingTier) return;
    setSavingTier(true);
    try {
      // Ensure numeric values are properly parsed
      const updateData = {
        level_name: editingTier.level_name,
        upgrade_cost_usd: Number(editingTier.upgrade_cost_usd) || 0,
        min_withdrawal_amount: Number(editingTier.min_withdrawal_amount) || 0,
        max_withdrawal_amount: Number(editingTier.max_withdrawal_amount) || 0,
        commission_rate: Number(editingTier.commission_rate) || 0,
        badge_color: editingTier.badge_color,
        benefits: editingTier.description?.trim() ? { description: editingTier.description.trim() } : null,
        is_active: editingTier.is_active
      };
      
      console.log('[AdminTopupSystem] Saving tier:', editingTier.id, updateData);

      const isNewTier = editingTier.id.startsWith('temp-');
      const { error } = isNewTier
        ? await supabase
            .from('trader_level_tiers')
            .insert({
              ...updateData,
              level_number: editingTier.level_number,
            })
        : await supabase
            .from('trader_level_tiers')
            .update(updateData)
            .eq('id', editingTier.id);
      
      if (error) {
        console.error('[AdminTopupSystem] Save error:', error);
        throw error;
      }
      
      toast({ title: "Success", description: "Level tier updated successfully" });
      setShowEditTierModal(false);
      setEditingTier(null);
      
      // Force refresh the data
      await fetchLevelTiers();
    } catch (error: any) {
      console.error('[AdminTopupSystem] Error saving tier:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingTier(false);
    }
  };

  // Manual Topup Functions - performSearch for auto-search
  const performSearch = async (trimmedQuery: string) => {
    if (!trimmedQuery || trimmedQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Try exact match on app_uid first (handles numeric UIDs)
      const { data: exactMatch, error: exactError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified')
        .eq('app_uid', trimmedQuery)
        .limit(1);
      
      console.log('[AdminTopup] Exact match search for:', trimmedQuery, 'Result:', exactMatch, 'Error:', exactError);
      
      if (exactMatch && exactMatch.length > 0) {
        setSearchResults(exactMatch);
        setSearching(false);
        return;
      }
      
      // Try partial/contains match on app_uid (for partial UID search)
      const { data: uidContains } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified')
        .ilike('app_uid', `%${trimmedQuery}%`)
        .limit(10);
      
      console.log('[AdminTopup] UID contains search result:', uidContains);
      
      if (uidContains && uidContains.length > 0) {
        setSearchResults(uidContains);
        setSearching(false);
        return;
      }
      
      // Finally try display_name search
      const { data: nameMatch } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified')
        .ilike('display_name', `%${trimmedQuery}%`)
        .limit(10);
      
      console.log('[AdminTopup] Name search result:', nameMatch);
      setSearchResults(nameMatch || []);
    } catch (error) {
      console.error('[AdminTopup] Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // searchUsers for button click / Enter key
  const searchUsers = () => {
    performSearch(searchQuery.trim());
  };

  const loadRecentTopups = async () => {
    try {
      const { data } = await supabase
        .from('admin_logs')
        .select('*')
        .eq('action_type', 'add_user_coins')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        // Batch fetch all user profiles in one query
        const targetIds = [...new Set(data.map(l => l.target_id).filter(Boolean))] as string[];
        const { data: users } = targetIds.length > 0 ? await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, app_uid')
          .in('id', targetIds) : { data: [] };
        const userMap = new Map((users || []).map(u => [u.id, u]));
        const logsWithUsers = data.map(log => ({
          ...log,
          user: userMap.get(log.target_id || '') || null,
          details: log.details as TopupLog['details'],
        }));
        setRecentTopups(logsWithUsers);
        setStats(prev => ({ ...prev, totalManualTopups: logsWithUsers.length }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleTopup = async () => {
    if (!selectedUser || !amount || parseInt(amount) <= 0) {
      toast({ title: "Error", description: "Please select a user and enter amount", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_add_user_coins', {
        _user_id: selectedUser.id,
        _amount: parseInt(amount),
        _note: note || null
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Failed to add diamonds');
      
      toast({ title: "Success! ✅", description: `${amount} diamonds added to ${selectedUser.display_name}` });
      setSelectedUser(null);
      setAmount("");
      setNote("");
      setSearchQuery("");
      setSearchResults([]);
      loadRecentTopups();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // Traders Functions
  const fetchHelpers = async () => {
    try {
      const { data } = await supabase
        .from('topup_helpers')
        .select(`*, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, is_online)`)
        .order('created_at', { ascending: false });
      setHelpers(data || []);
      setStats(prev => ({
        ...prev,
        totalHelpers: (data || []).length,
        activeHelpers: (data || []).filter((h: any) => h.is_active && h.is_verified).length,
        totalCoinsTraded: (data || []).reduce((sum: number, h: any) => sum + (h.total_bought || 0), 0),
      }));
    } catch (error) {
      console.error(error);
    }
  };

  const searchUsersForHelper = async (query: string) => {
    if (!query || query.length < 2) { setUserSearchResults([]); return; }
    const { data } = await supabase.from('profiles').select('id, display_name, avatar_url, app_uid')
      .or(`display_name.ilike.%${query}%,app_uid.ilike.%${query}%`).limit(10);
    setUserSearchResults(data || []);
  };

  const handleAddHelper = async () => {
    if (!selectedUserForHelper) return;
    setAddingHelper(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('topup_helpers').insert({
        user_id: selectedUserForHelper.id, is_active: true, is_verified: true,
        approved_at: new Date().toISOString(), approved_by: user?.id
      });
      if (error) throw error;
      toast({ title: "Success", description: "New trader added successfully" });
      setShowAddModal(false);
      setSelectedUserForHelper(null);
      fetchHelpers();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setAddingHelper(false);
    }
  };

  const handleToggleHelper = async (helper: Helper, action: 'activate' | 'deactivate') => {
    const newStatus = action === 'activate';
    
    // Step 1: Update is_active with error checking
    const { error: updateError } = await supabase.from('topup_helpers').update({ 
      is_active: newStatus
    }).eq('id', helper.id);

    if (updateError) {
      console.error('[Admin] Failed to toggle helper:', updateError);
      toast({ title: "Error", description: `Failed to ${action} helper: ${updateError.message}`, variant: "destructive" });
      return;
    }

    // Step 2: Verify the update actually applied
    const { data: verifyData } = await supabase
      .from('topup_helpers')
      .select('is_active')
      .eq('id', helper.id)
      .maybeSingle();

    if (verifyData?.is_active !== newStatus) {
      console.error('[Admin] Toggle verification failed! Expected:', newStatus, 'Got:', verifyData?.is_active);
      toast({ title: "Error", description: `Database update failed - status did not change. Please try again or contact support.`, variant: "destructive" });
      return;
    }

    // If Level 5 payroll helper, update agency commission rate instantly
    if (helper.trader_level === 5 && helper.payroll_enabled) {
      const { data: agency } = await supabase
        .from('agencies')
        .select('id, level')
        .eq('owner_id', helper.user_id)
        .maybeSingle();

      if (agency) {
        if (action === 'deactivate') {
          const levelMap: Record<string, string> = { 'A1': 'bronze', 'A2': 'silver', 'A3': 'gold', 'A4': 'platinum', 'A5': 'diamond' };
          const tierCode = levelMap[agency.level || 'A1'] || agency.level || 'bronze';
          const { data: tier } = await supabase
            .from('agency_level_tiers')
            .select('commission_rate')
            .eq('level_code', tierCode)
            .eq('is_active', true)
            .maybeSingle();
          const tierRate = tier?.commission_rate || 3;
          await supabase.from('agencies').update({ commission_rate: tierRate }).eq('id', agency.id);
          console.log(`[Admin] Deactivated L5 helper → Agency ${agency.id} commission reset to ${tierRate}%`);
        } else {
          await supabase.from('agencies').update({ commission_rate: 12 }).eq('id', agency.id);
          console.log(`[Admin] Activated L5 helper → Agency ${agency.id} commission restored to 12%`);
        }
      }
    }

    console.log(`[Admin] Helper ${helper.id} successfully ${action}d. Verified is_active=${newStatus}`);
    toast({ title: "Success ✅", description: `Trader ${action === 'activate' ? 'activated' : 'deactivated'} successfully` });
    fetchHelpers();
  };

  const handleCoinTransfer = async () => {
    if (!selectedHelper || !transferAmount) return;
    const amt = parseInt(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setIsTransferring(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newBalance = (selectedHelper.wallet_balance || 0) + amt;
      
      const { error: updateError } = await supabase
        .from('topup_helpers')
        .update({ 
          wallet_balance: newBalance,
          total_bought: (selectedHelper.total_bought || 0) + amt 
        })
        .eq('id', selectedHelper.id);
      if (updateError) throw updateError;

      await supabase.from('helper_transactions').insert({
        helper_id: selectedHelper.id,
        transaction_type: 'admin_transfer',
        coin_amount: amt,
        usd_amount: 0,
        status: 'completed',
        notes: transferNote || `Admin transfer: ${amt} diamonds`,
        processed_by: user?.id,
        processed_at: new Date().toISOString()
      });

      // Send notification to helper
      await adminSendNotification(selectedHelper.user_id, '💎 Diamonds Added!', `${amt.toLocaleString()} diamonds have been added to your Trader Wallet`, 'diamonds_credited')

      toast({ title: "✅ Transfer Successful", description: `${amt.toLocaleString()} diamonds added to ${selectedHelper.user?.display_name}'s wallet` });
      setShowTransferModal(false);
      setSelectedHelper(null);
      setTransferAmount("");
      setTransferNote("");
      fetchHelpers();
      fetchTransactions();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleLevelUpgrade = async () => {
    if (!levelUpHelper) return;
    setUpgradingLevel(true);
    try {
      const { error } = await supabase
        .from('topup_helpers')
        .update({ 
          trader_level: newLevel,
          payroll_enabled: newLevel >= 5
        })
        .eq('id', levelUpHelper.id);
      if (error) throw error;
      
      toast({ title: "Success", description: `Trader upgraded to Level ${newLevel}` });
      setShowLevelModal(false);
      setLevelUpHelper(null);
      fetchHelpers();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setUpgradingLevel(false);
    }
  };

  // Orders & Transactions Functions
  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const { data } = await supabase
        .from('helper_orders')
        .select(`*, user:profiles!helper_orders_user_id_fkey(display_name, avatar_url, app_uid),
          helper:topup_helpers!helper_orders_helper_id_fkey(id, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url))`)
        .order('created_at', { ascending: false })
        .limit(100);
      setOrders(data || []);
      setStats(prev => ({ ...prev, pendingOrders: (data || []).filter((o: any) => o.status === 'pending').length }));
    } catch (error) {
      console.error(error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const { data } = await supabase
        .from('helper_transactions')
        .select(`*, helper:topup_helpers(id, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid))`)
        .order('created_at', { ascending: false })
        .limit(100);
      setTransactions(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleProcessOrder = async (order: HelperOrder, action: 'approve' | 'reject') => {
    try {
       // If approving, first add coins to user
       if (action === 'approve') {
         const { error: rpcError } = await supabase.rpc('add_coins_to_user', {
           _user_id: order.user_id,
           _amount: order.coin_amount
         });
         
         if (rpcError) {
           console.error('RPC Error:', rpcError);
           throw new Error('Failed to add coins to user');
         }
         
         // Deduct from helper wallet
         const { data: helperData } = await supabase
           .from('topup_helpers')
           .select('wallet_balance, total_sold')
           .eq('id', order.helper_id)
           .single();
         
         if (helperData) {
           await supabase
             .from('topup_helpers')
             .update({ 
               wallet_balance: Math.max(0, (helperData.wallet_balance || 0) - order.coin_amount),
               total_sold: (helperData.total_sold || 0) + order.coin_amount
             })
             .eq('id', order.helper_id);
         }
         
         // Send notification to user
         await adminSendNotification(order.user_id, '💎 Diamonds Added!', `${order.coin_amount.toLocaleString()} diamonds added to your account!`, 'coin_purchase_helper')
       }
       
      await supabase.from('helper_orders').update({
        status: action === 'approve' ? 'completed' : 'cancelled',
        processed_at: new Date().toISOString()
      }).eq('id', order.id);
       
      toast({ title: "Success", description: `Order ${action === 'approve' ? 'approved' : 'rejected'}` });
      fetchOrders();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Filtered helpers
  const filteredHelpers = helpers.filter(h => {
    const matchesSearch = !helperSearchQuery || 
      h.user?.display_name?.toLowerCase().includes(helperSearchQuery.toLowerCase()) || 
      h.user?.app_uid?.includes(helperSearchQuery);
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && h.is_active) || 
      (statusFilter === 'inactive' && !h.is_active);
    return matchesSearch && matchesStatus;
  });

  // Filtered orders
  const filteredOrders = orders.filter(o => {
    return orderStatusFilter === 'all' || o.status === orderStatusFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Diamond className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{stats.totalCoinsTraded.toLocaleString()}</p>
                <p className="text-xs text-white/80">Total Traded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{stats.activeHelpers}</p>
                <p className="text-xs text-white/80">Active Traders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{stats.pendingOrders}</p>
                <p className="text-xs text-white/80">Pending Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white border-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{stats.totalManualTopups}</p>
                <p className="text-xs text-white/80">Manual Topups</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-600 to-slate-800 text-white border-0 col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{stats.totalHelpers}</p>
                <p className="text-xs text-white/80">Total Traders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
        <TabsList className="w-full h-auto flex-wrap bg-white/80 backdrop-blur-sm shadow-sm rounded-xl p-1 gap-1">
          <TabsTrigger value="manual" className="flex-1 min-w-[80px] gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Coins className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Manual</span> Topup
          </TabsTrigger>
          <TabsTrigger value="traders" className="flex-1 min-w-[80px] gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Users className="w-3 h-3 sm:w-4 sm:h-4" />
            Traders
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1 min-w-[80px] gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Package className="w-3 h-3 sm:w-4 sm:h-4" />
            Orders
            {stats.pendingOrders > 0 && (
              <Badge className="ml-1 h-5 px-1.5 bg-red-500 text-white text-xs">{stats.pendingOrders}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex-1 min-w-[80px] gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Trans</span>actions
          </TabsTrigger>
          <TabsTrigger value="levels" className="flex-1 min-w-[80px] gap-1 sm:gap-2 text-xs sm:text-sm py-2">
            <Award className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Level</span> Settings
          </TabsTrigger>
        </TabsList>

        {/* Manual Topup Tab */}
        <TabsContent value="manual" className="mt-4 space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Coins className="w-5 h-5 text-amber-500" />
                  Add Coins to User
                </CardTitle>
                <CardDescription>Search for any user and add coins directly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* User Search */}
                <div className="space-y-2">
                  <Label>Search User (Name or ID)</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Search by name or App UID..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchUsers()}
                      className="flex-1"
                    />
                    <Button onClick={searchUsers} disabled={searching} size="icon">
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && !selectedUser && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {searchResults.map(user => (
                      <button
                        key={user.id}
                        onClick={() => { setSelectedUser(user); setSearchResults([]); }}
                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback>{user.display_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{user.display_name}</p>
                            {user.is_host && <Badge className="bg-pink-100 text-pink-600 text-xs">Host</Badge>}
                          </div>
                          <p className="text-xs text-slate-500">ID: {user.app_uid} • 💎 {(user.coins || 0).toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected User */}
                {selectedUser && (
                  <div className="p-3 sm:p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12 ring-2 ring-amber-300">
                        <AvatarImage src={selectedUser.avatar_url} />
                        <AvatarFallback>{selectedUser.display_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{selectedUser.display_name}</h3>
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-slate-600">ID: {selectedUser.app_uid}</p>
                        <p className="text-xs font-medium text-amber-700">Balance: {(selectedUser.coins || 0).toLocaleString()} 💎</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} className="text-slate-500 flex-shrink-0">
                        Change
                      </Button>
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div className="space-y-2">
                  <Label>Diamond Amount</Label>
                  <Input 
                    type="number"
                    placeholder="e.g: 10000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                  <div className="flex gap-2 flex-wrap">
                    {[1000, 5000, 10000, 50000, 100000].map(val => (
                      <Button key={val} variant="outline" size="sm" onClick={() => setAmount(val.toString())} className="text-xs">
                        {val.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label>Note (Optional)</Label>
                  <Textarea placeholder="Reason for topup..." value={note} onChange={e => setNote(e.target.value)} rows={2} />
                </div>

                {/* Submit */}
                <Button 
                  onClick={handleTopup}
                  disabled={!selectedUser || !amount || processing}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {processing ? "Processing..." : "Add Diamonds"}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Topups */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <History className="w-5 h-5 text-slate-500" />
                  Recent Topups
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {recentTopups.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Sparkles className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p>No topup history yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentTopups.map(log => (
                        <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={log.user?.avatar_url} />
                            <AvatarFallback>{log.user?.display_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{log.user?.display_name}</p>
                            <p className="text-xs text-slate-500">{log.user?.app_uid}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              +{log.details?.amount?.toLocaleString()} 💎
                            </Badge>
                            <p className="text-xs text-slate-400 mt-1">
                              {format(new Date(log.created_at), 'dd/MM HH:mm')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Traders Tab */}
        <TabsContent value="traders" className="mt-4 space-y-4">
          {/* Search & Actions */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search traders..." 
                value={helperSearchQuery} 
                onChange={e => setHelperSearchQuery(e.target.value)} 
                className="pl-10" 
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowAddModal(true)} className="gap-2 bg-emerald-500 hover:bg-emerald-600">
              <Plus className="w-4 h-4" />
              Add Trader
            </Button>
          </div>

          {/* Traders List */}
          <div className="grid gap-3 sm:gap-4">
            {filteredHelpers.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500">No traders found</p>
              </Card>
            ) : (
              filteredHelpers.map(helper => (
                <Card key={helper.id} className="overflow-hidden">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="relative">
                          <Avatar className="w-12 h-12 ring-2 ring-emerald-200">
                            <AvatarImage src={helper.user?.avatar_url || ''} />
                            <AvatarFallback>{helper.user?.display_name?.charAt(0) || 'T'}</AvatarFallback>
                          </Avatar>
                          {helper.user?.is_online && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm sm:text-base truncate">{helper.user?.display_name || 'Unknown'}</h3>
                            {helper.is_active ? (
                              <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-700 text-xs">Inactive</Badge>
                            )}
                            <Badge className={cn(
                              "text-xs text-white bg-gradient-to-r",
                              LEVEL_COLORS[helper.trader_level || 1]
                            )}>
                              Lv.{helper.trader_level || 1} {LEVEL_NAMES[(helper.trader_level || 1) - 1]}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">ID: {helper.user?.app_uid}</p>
                          <div className="flex items-center gap-3 sm:gap-4 mt-1 text-xs text-slate-600 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Wallet className="w-3 h-3" />
                              {(helper.wallet_balance || 0).toLocaleString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3 text-green-500" />
                              {(helper.total_bought || 0).toLocaleString()}
                            </span>
                            {helper.payroll_enabled && (
                              <Badge className="bg-purple-100 text-purple-700 text-xs">Payroll</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-xs"
                          onClick={() => {
                            setSelectedHelper(helper);
                            setShowTransferModal(true);
                          }}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Transfer
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setLevelUpHelper(helper);
                              setNewLevel(helper.trader_level || 1);
                              setShowLevelModal(true);
                            }}>
                              <Award className="w-4 h-4 mr-2 text-amber-600" />
                              Upgrade Level
                            </DropdownMenuItem>
                            {helper.is_active ? (
                              <DropdownMenuItem onClick={() => handleToggleHelper(helper, 'deactivate')} className="text-red-600">
                                <Ban className="w-4 h-4 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleToggleHelper(helper, 'activate')} className="text-green-600">
                                <Check className="w-4 h-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchOrders} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Trader</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                          No orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.slice(0, 50).map(order => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={order.user?.avatar_url} />
                                <AvatarFallback>{order.user?.display_name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{order.user?.display_name}</p>
                                <p className="text-xs text-slate-500">{order.user?.app_uid}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{order.helper?.user?.display_name || 'N/A'}</p>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{order.coin_amount?.toLocaleString()} 💎</p>
                              <p className="text-xs text-slate-500">${order.amount_usd?.toFixed(2)}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "text-xs",
                              order.status === 'pending' && "bg-yellow-100 text-yellow-700",
                              order.status === 'completed' && "bg-green-100 text-green-700",
                              order.status === 'cancelled' && "bg-red-100 text-red-700"
                            )}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {format(new Date(order.created_at), 'dd/MM/yy HH:mm')}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.status === 'pending' && (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600" onClick={() => handleProcessOrder(order, 'approve')}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => handleProcessOrder(order, 'reject')}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">Last 100 transactions</p>
            <Button variant="outline" onClick={fetchTransactions} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trader</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.slice(0, 50).map(txn => (
                        <TableRow key={txn.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={txn.helper?.user?.avatar_url} />
                                <AvatarFallback>{txn.helper?.user?.display_name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <p className="font-medium text-sm">{txn.helper?.user?.display_name}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {txn.transaction_type === 'admin_transfer' ? (
                                <ArrowDownLeft className="w-4 h-4 text-green-500" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 text-blue-500" />
                              )}
                              <span className="text-sm capitalize">{txn.transaction_type.replace(/_/g, ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{txn.coin_amount?.toLocaleString()} 💎</p>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "text-xs",
                              txn.status === 'pending' && "bg-yellow-100 text-yellow-700",
                              txn.status === 'completed' && "bg-green-100 text-green-700",
                              txn.status === 'failed' && "bg-red-100 text-red-700"
                            )}>
                              {txn.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {format(new Date(txn.created_at), 'dd/MM/yy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Level Settings Tab */}
        <TabsContent value="levels" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Award className="w-5 h-5 text-amber-500" />
                    Trader Level Tiers
                  </CardTitle>
                  <CardDescription>Configure level requirements, costs, and benefits</CardDescription>
                </div>
                <Button variant="outline" onClick={fetchLevelTiers} size="sm" className="gap-2 self-start">
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {levelTiers.map((tier) => (
                  <motion.div
                    key={tier.id}
                    className="border rounded-xl overflow-hidden"
                    whileHover={{ scale: 1.01 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={cn(
                      "p-4 bg-gradient-to-r text-white",
                      LEVEL_COLORS[tier.level_number] || 'from-slate-500 to-slate-600'
                    )}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl font-bold">
                            {tier.level_number}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{tier.level_name}</h3>
                            <p className="text-sm text-white/80">{tier.description}</p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-white/20 hover:bg-white/30 text-white border-0 gap-2 self-start sm:self-auto"
                          onClick={() => {
                            setEditingTier({ ...tier });
                            setShowEditTierModal(true);
                          }}
                        >
                          <Settings className="w-4 h-4" />
                          Edit
                        </Button>
                      </div>
                    </div>
                    <div className="p-4 bg-white">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Upgrade Cost</p>
                          <p className="font-bold text-lg text-emerald-600">
                            {tier.upgrade_cost_usd === 0 ? 'Free' : `$${tier.upgrade_cost_usd}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Commission</p>
                          <p className="font-bold text-lg text-purple-600">
                            {tier.commission_rate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Min Withdrawal</p>
                          <p className="font-medium">
                            {tier.min_withdrawal_amount === 0 ? '-' : `${tier.min_withdrawal_amount.toLocaleString()} 💎`}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Max Withdrawal</p>
                          <p className="font-medium">
                            {tier.max_withdrawal_amount === 0 ? '-' : `${tier.max_withdrawal_amount.toLocaleString()} 💎`}
                          </p>
                        </div>
                      </div>
                      {tier.level_number === 5 && (
                        <div className="mt-3 p-2 bg-purple-50 rounded-lg flex items-center gap-2 text-purple-700 text-sm">
                          <Crown className="w-4 h-4" />
                          <span>Payroll System Access Enabled</span>
                        </div>
                      )}
                      {!tier.is_active && (
                        <div className="mt-3 p-2 bg-red-50 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                          <Ban className="w-4 h-4" />
                          <span>This level is currently disabled</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {levelTiers.length === 0 && (
                  <div className="text-center py-12">
                    <Award className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">No level tiers configured</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Level Benefits Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Level Benefits Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Level</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>User Transfer</TableHead>
                      <TableHead>Agency Transfer</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Payroll</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {levelTiers.map(tier => (
                      <TableRow key={tier.id}>
                        <TableCell>
                          <Badge className={cn(
                            "text-white bg-gradient-to-r",
                            LEVEL_COLORS[tier.level_number]
                          )}>
                            Lv.{tier.level_number} {tier.level_name.replace(' Trader', '')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {tier.upgrade_cost_usd === 0 ? 'Free' : `$${tier.upgrade_cost_usd}`}
                        </TableCell>
                        <TableCell>
                          <Check className="w-4 h-4 text-green-500" />
                        </TableCell>
                        <TableCell>
                          {tier.level_number >= 2 ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <X className="w-4 h-4 text-red-400" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-purple-600">
                          {tier.commission_rate}%
                        </TableCell>
                        <TableCell>
                          {tier.level_number >= 5 ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <X className="w-4 h-4 text-red-400" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Trader Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Trader</DialogTitle>
            <DialogDescription>Search for a user to add as a diamond trader</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search User</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="Name or App UID..."
                  value={userSearchQuery}
                  onChange={e => {
                    setUserSearchQuery(e.target.value);
                    searchUsersForHelper(e.target.value);
                  }}
                />
              </div>
            </div>
            
            {userSearchResults.length > 0 && !selectedUserForHelper && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {userSearchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => { setSelectedUserForHelper(user); setUserSearchResults([]); }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback>{user.display_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{user.display_name}</p>
                      <p className="text-xs text-slate-500">ID: {user.app_uid}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedUserForHelper && (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 ring-2 ring-emerald-300">
                    <AvatarImage src={selectedUserForHelper.avatar_url} />
                    <AvatarFallback>{selectedUserForHelper.display_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{selectedUserForHelper.display_name}</p>
                    <p className="text-xs text-slate-600">ID: {selectedUserForHelper.app_uid}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUserForHelper(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button 
              onClick={handleAddHelper} 
              disabled={!selectedUserForHelper || addingHelper}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {addingHelper ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Trader
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Diamonds</DialogTitle>
            <DialogDescription>Add diamonds to trader's wallet</DialogDescription>
          </DialogHeader>
          {selectedHelper && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={selectedHelper.user?.avatar_url} />
                    <AvatarFallback>{selectedHelper.user?.display_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{selectedHelper.user?.display_name}</p>
                    <p className="text-sm text-slate-500">Current: {(selectedHelper.wallet_balance || 0).toLocaleString()} 💎</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Amount</Label>
                <Input 
                  type="number"
                  placeholder="Enter amount..."
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  {[5000, 10000, 50000, 100000].map(val => (
                    <Button key={val} variant="outline" size="sm" onClick={() => setTransferAmount(val.toString())} className="text-xs">
                      {val.toLocaleString()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note (Optional)</Label>
                <Textarea value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="Transfer note..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferModal(false)}>Cancel</Button>
            <Button 
              onClick={handleCoinTransfer} 
              disabled={!transferAmount || isTransferring}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {isTransferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Level Upgrade Modal */}
      <Dialog open={showLevelModal} onOpenChange={setShowLevelModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade Trader Level</DialogTitle>
            <DialogDescription>Set the trader level (1-5). Level 5 enables Payroll access.</DialogDescription>
          </DialogHeader>
          {levelUpHelper && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={levelUpHelper.user?.avatar_url} />
                    <AvatarFallback>{levelUpHelper.user?.display_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{levelUpHelper.user?.display_name}</p>
                    <Badge className={cn("text-xs text-white bg-gradient-to-r", LEVEL_COLORS[levelUpHelper.trader_level || 1])}>
                      Current: Lv.{levelUpHelper.trader_level || 1}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>New Level</Label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <Button
                      key={level}
                      variant={newLevel === level ? "default" : "outline"}
                      className={cn(
                        "h-12 flex-col gap-0.5",
                        newLevel === level && `bg-gradient-to-r ${LEVEL_COLORS[level]} text-white border-0`
                      )}
                      onClick={() => setNewLevel(level)}
                    >
                      <span className="text-lg font-bold">{level}</span>
                      <span className="text-xs opacity-80">{LEVEL_NAMES[level - 1]}</span>
                    </Button>
                  ))}
                </div>
                {newLevel === 5 && (
                  <p className="text-xs text-purple-600 flex items-center gap-1 mt-2">
                    <Crown className="w-3 h-3" />
                    Level 5 traders get access to Payroll System
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLevelModal(false)}>Cancel</Button>
            <Button 
              onClick={handleLevelUpgrade} 
              disabled={upgradingLevel}
              className="bg-gradient-to-r from-amber-500 to-orange-500"
            >
              {upgradingLevel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Award className="w-4 h-4 mr-2" />}
              Upgrade to Level {newLevel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Level Tier Modal */}
      <Dialog open={showEditTierModal} onOpenChange={setShowEditTierModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Edit Level Tier
            </DialogTitle>
            <DialogDescription>Configure level requirements and benefits</DialogDescription>
          </DialogHeader>
          {editingTier && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl bg-gradient-to-r",
                    LEVEL_COLORS[editingTier.level_number]
                  )}>
                    {editingTier.level_number}
                  </div>
                  <div>
                    <p className="font-semibold">Level {editingTier.level_number}</p>
                    <p className="text-sm text-slate-500">{LEVEL_NAMES[editingTier.level_number - 1]} Tier</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Level Name</Label>
                  <Input 
                    value={editingTier.level_name}
                    onChange={e => setEditingTier({ ...editingTier, level_name: e.target.value })}
                    placeholder="e.g. Bronze Trader"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Upgrade Cost (USD)</Label>
                  <Input 
                    type="number"
                    value={editingTier.upgrade_cost_usd ?? 0}
                    onChange={e => setEditingTier({ ...editingTier, upgrade_cost_usd: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    placeholder="0 for free"
                    min="0"
                    step="0.01"
                  />
                  <p className="text-xs text-slate-500">Set to 0 for free tier</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Withdrawal</Label>
                    <Input 
                      type="number"
                      value={editingTier.min_withdrawal_amount ?? 0}
                      onChange={e => setEditingTier({ ...editingTier, min_withdrawal_amount: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Withdrawal</Label>
                    <Input 
                      type="number"
                      value={editingTier.max_withdrawal_amount ?? 0}
                      onChange={e => setEditingTier({ ...editingTier, max_withdrawal_amount: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Commission Rate (%)</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    value={editingTier.commission_rate ?? 0}
                    onChange={e => setEditingTier({ ...editingTier, commission_rate: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    placeholder="0"
                    min="0"
                    max="100"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Badge Color (Hex)</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={editingTier.badge_color}
                      onChange={e => setEditingTier({ ...editingTier, badge_color: e.target.value })}
                      placeholder="#CD7F32"
                    />
                    <div 
                      className="w-10 h-10 rounded-lg border flex-shrink-0"
                      style={{ backgroundColor: editingTier.badge_color }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea 
                    value={editingTier.description}
                    onChange={e => setEditingTier({ ...editingTier, description: e.target.value })}
                    placeholder="Describe the level benefits..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <Label>Active Status</Label>
                    <p className="text-xs text-slate-500">Enable or disable this level</p>
                  </div>
                  <Switch 
                    checked={editingTier.is_active}
                    onCheckedChange={checked => setEditingTier({ ...editingTier, is_active: checked })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTierModal(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveTier} 
              disabled={savingTier}
              className="bg-gradient-to-r from-amber-500 to-orange-500"
            >
              {savingTier ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTopupSystem;
