import { useState, useEffect, useCallback, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, Coins, Send, User, Check, History,
  Diamond, Sparkles, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";
import { loadAdminTopupHistory, formatTopupFieldLabel, type TopupHistoryEntry } from "@/utils/adminTopupHistory";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string;
  app_uid: string;
  coins: number;
  diamonds: number;
  is_host: boolean;
  is_verified: boolean;
}

type TopupLog = TopupHistoryEntry;

const AdminManualTopup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recentTopups, setRecentTopups] = useState<TopupLog[]>([]);
  const [searching, setSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Debounce timer ref for auto-search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent topups on mount
  useEffect(() => {
    setMounted(true);
    loadRecentTopups();
  }, []);

  useAdminRealtime(['admin_logs', 'profiles'], () => loadRecentTopups());

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

  const performSearch = async (trimmedQuery: string) => {
    if (!trimmedQuery || trimmedQuery.length < 1) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    console.log('[AdminManualTopup] Auto-searching for:', trimmedQuery);
    
    try {
      // First try exact app_uid match
      const { data: exactMatch, error: exactError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, diamonds, diamonds, is_host, is_verified')
        .eq('app_uid', trimmedQuery)
        .limit(1);
      
      if (exactError) {
        recordAdminError({ kind: "rpc", label: "AdminManualTopup.AdminmanualtopupExactSearchError", message: formatAdminError(exactError)});
      }
      
      // If exact match found, use it
      if (exactMatch && exactMatch.length > 0) {
        console.log('[AdminManualTopup] Exact match found:', exactMatch[0].display_name);
        setSearchResults(exactMatch);
        setSearching(false);
        return;
      }
      
      // Otherwise, try partial match on display_name or app_uid
      const { data: partialMatch, error: partialError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, diamonds, diamonds, is_host, is_verified')
        .or(`display_name.ilike.%${trimmedQuery}%,app_uid.ilike.%${trimmedQuery}%`)
        .order('display_name', { ascending: true })
        .limit(20);
      
      if (partialError) {
        recordAdminError({ kind: "rpc", label: "AdminManualTopup.AdminmanualtopupPartialSearchError", message: formatAdminError(partialError)});
        setSearchResults([]);
        return;
      }
      
      console.log('[AdminManualTopup] Partial results:', partialMatch?.length || 0, 'users found');
      setSearchResults(partialMatch || []);
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminManualTopup.AdminmanualtopupSearchException", message: formatAdminError(error)});
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Manual search function (for button click / Enter key)
  const searchUsers = useCallback(() => {
    performSearch(searchQuery.trim());
  }, [searchQuery]);

  const loadRecentTopups = async () => {
    try {
      const entries = await loadAdminTopupHistory({ limit: 30, creditsOnly: true });
      setRecentTopups(entries);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminManualTopup", message: formatAdminError(error) });
    }
  };

  const handleTopup = async () => {
    if (!selectedUser || !amount || parseInt(amount) <= 0) {
      toast({ 
        title: "Error", 
        description: "Please select a user and amount", 
        variant: "destructive" 
      });
      return;
    }

    setProcessing(true);
    try {
      const diamondAmount = parseInt(amount);
      const { data, error } = await supabase.rpc('admin_adjust_balance', {
        _target_type: 'profile',
        _target_id: selectedUser.id,
        _field: 'diamonds',
        _delta: diamondAmount,
        _reason: note || null
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to add diamonds');
      }

      toast({ 
        title: "Success! ✅", 
        description: `${diamondAmount.toLocaleString()} diamonds added to ${selectedUser.display_name}`
      });

      // Reset form
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

  // Removed - now using useEffect at top of component

  return (
    <div className="admin-pro-shell pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-white/20" onClick={() => navigate('/admin/diamonds')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
             <h1 className="font-bold text-xl text-slate-900">Manual Top-Up</h1>
              <p className="text-slate-700 text-sm">Add diamonds to any user</p>
          </div>
        </div>

        <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/30 flex items-center justify-center">
              <Diamond className="w-6 h-6 text-slate-900" />
            </div>
            <div>
               <p className="text-slate-700 text-sm">Admin Diamond Management</p>
                <p className="text-slate-900 font-bold">Search user & add diamonds</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6">
        {/* Search & Add Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              Diamond Top-Up
            </CardTitle>
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
                <Button 
                  onClick={searchUsers} 
                  disabled={searching || !searchQuery.trim()}
                  className="min-w-[50px]"
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {/* Show searching indicator */}
              {searching && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Searching...
                </p>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && !selectedUser && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setSearchResults([]);
                    }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
                  >
                    <Avatar className="w-10 h-10">
                      <UserAvatarImage gender={((user) as any)?.gender} seed={((user) as any)?.id ?? ((user) as any)?.user_id ?? ((user) as any)?.host_id} src={user.avatar_url} />
                      <AvatarFallback>{user.display_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.display_name}</p>
                        {user.is_host && <Badge className="bg-pink-100 text-pink-600 text-xs">Host</Badge>}
                        {user.is_verified && <Badge className="bg-blue-100 text-blue-600 text-xs">Verified</Badge>}
                      </div>
                      <p className="text-sm text-slate-500">ID: {user.app_uid} • 💎 {(user.diamonds || 0).toLocaleString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected User */}
            {selectedUser && (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center gap-3">
                  <Avatar className="w-14 h-14 ring-2 ring-amber-300">
                    <UserAvatarImage gender={((selectedUser) as any)?.gender} seed={((selectedUser) as any)?.id ?? ((selectedUser) as any)?.user_id ?? ((selectedUser) as any)?.host_id} src={selectedUser.avatar_url} />
                    <AvatarFallback>{selectedUser.display_name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{selectedUser.display_name}</h3>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>
                    <p className="text-sm text-slate-600">ID: {selectedUser.app_uid}</p>
                    <p className="text-sm font-medium text-amber-700">
                      Current Balance: {(selectedUser.diamonds || 0).toLocaleString()} 💎
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedUser(null)}
                    className="text-slate-500"
                  >
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
                 placeholder="e.g. 10000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              {/* Quick amounts */}
              <div className="flex gap-2 flex-wrap">
                {[1000, 5000, 10000, 50000, 100000].map(val => (
                  <Button 
                    key={val}
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount(val.toString())}
                    className="text-xs"
                  >
                    {val.toLocaleString()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
               <Label>Note (optional)</Label>
               <Textarea 
                 placeholder="Reason for top-up..."
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
              />
            </div>

            {/* Submit */}
            <Button 
              onClick={handleTopup}
              disabled={!selectedUser || !amount || processing}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {processing ? (
                 "Processing..."
               ) : (
                 <>
                   <Send className="w-4 h-4 mr-2" />
                   Add Diamonds
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Topups */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-500" />
              Recent Topups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTopups.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Sparkles className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p>No topup history found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                       <TableHead>Recipient</TableHead>
                       <TableHead>Amount</TableHead>
                       <TableHead>Before/After</TableHead>
                       <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTopups.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <UserAvatarImage seed={(((log.user) as any)?.id ?? ((log.user) as any)?.user_id ?? ((log.user) as any)?.host_id)} gender={((log.user) as any)?.gender} src={log.user?.avatar_url ?? undefined} />
                              <AvatarFallback>{(log.user?.display_name ?? log.recipient_name ?? '?').charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{log.user?.display_name ?? log.recipient_name ?? '—'}</p>
                              <p className="text-xs text-slate-500">
                                {log.target_label}{log.user?.app_uid ? ` • ${log.user.app_uid}` : ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-700">
                            +{Math.abs(log.delta).toLocaleString()} {formatTopupFieldLabel(log.field)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-slate-500">{log.old_balance?.toLocaleString?.() ?? '—'}</span>
                          <span className="mx-1">→</span>
                          <span className="text-green-600 font-medium">{log.new_balance?.toLocaleString?.() ?? '—'}</span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {format(new Date(log.created_at), 'dd/MM/yy HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminManualTopup;