import { useState, useEffect } from "react";
import {
  Search, Gem, Loader2, CheckCircle, User, Send, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface HelperResult {
  id: string;
  user_id: string;
  trader_level: number;
  wallet_balance: number;
  is_active: boolean;
  payroll_enabled: boolean;
  country_code: string | null;
  user?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

interface TopupLog {
  id: string;
  helper_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  helper?: {
    user?: {
      display_name: string;
      avatar_url: string;
      app_uid: string;
    };
  };
}

const AdminHelperDiamondTopup = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HelperResult[]>([]);
  const [selectedHelper, setSelectedHelper] = useState<HelperResult | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recentTopups, setRecentTopups] = useState<TopupLog[]>([]);

  useEffect(() => {
    loadRecentTopups();
  }, []);

  const searchHelpers = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      // Step 1: Check if searching by agency code - find user_ids under that agency
      let agencyUserIds: string[] = [];
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id')
        .ilike('agency_code', `%${q}%`);

      if (agencyData && agencyData.length > 0) {
        const agencyIds = agencyData.map(a => a.id);
        const { data: hostData } = await supabase
          .from('agency_hosts')
          .select('host_id')
          .in('agency_id', agencyIds)
          .eq('status', 'active');
        agencyUserIds = (hostData || []).map(h => h.host_id);
      }

      // Step 2: Fetch all active helpers
      const { data, error } = await supabase
        .from('topup_helpers')
        .select(`
          id, user_id, trader_level, wallet_balance, is_active, payroll_enabled, country_code,
          user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
        `)
        .eq('is_active', true);

      if (error) throw error;

      // Step 3: Filter by name, UID, or agency code match
      const search = q.toLowerCase();
      const filtered = (data || []).filter((h: any) => {
        const name = h.user?.display_name?.toLowerCase() || '';
        const uid = h.user?.app_uid?.toLowerCase() || '';
        const matchNameOrUid = name.includes(search) || uid.includes(search);
        const matchAgency = agencyUserIds.includes(h.user_id);
        return matchNameOrUid || matchAgency;
      });

      setSearchResults(filtered as unknown as HelperResult[]);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const loadRecentTopups = async () => {
    try {
      const { data } = await supabase
        .from('admin_logs')
        .select('*')
        .eq('action_type', 'helper_diamond_topup')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const logsWithHelpers = await Promise.all(
          data.map(async (log) => {
            const { data: helper } = await supabase
              .from('topup_helpers')
              .select('user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)')
              .eq('id', log.target_id)
              .maybeSingle();
            const details = log.details as any;
            return {
              id: log.id,
              helper_id: log.target_id || '',
              amount: details?.amount || 0,
              note: details?.note || null,
              created_at: log.created_at || '',
              helper: helper as any,
            };
          })
        );
        setRecentTopups(logsWithHelpers);
      }
    } catch (error) {
      console.error('Load recent topups error:', error);
    }
  };

  const handleTopup = async () => {
    if (!selectedHelper || !amount || parseInt(amount) <= 0) {
      toast({
        title: "Error",
        description: "Please select a helper and enter an amount",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    try {
      const diamondAmount = parseInt(amount);

      // Update helper's wallet_balance
      const { error: updateError } = await supabase
        .from('topup_helpers')
        .update({
          wallet_balance: (selectedHelper.wallet_balance || 0) + diamondAmount
        })
        .eq('id', selectedHelper.id);

      if (updateError) throw updateError;

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();

      // Log the action
      await supabase.from('admin_logs').insert({
        action_type: 'helper_diamond_topup',
        admin_id: user?.id || null,
        target_id: selectedHelper.id,
        target_type: 'topup_helper',
        details: {
          amount: diamondAmount,
          note: note || null,
          helper_user_id: selectedHelper.user_id,
          helper_name: selectedHelper.user?.display_name,
          previous_balance: selectedHelper.wallet_balance,
          new_balance: (selectedHelper.wallet_balance || 0) + diamondAmount,
        }
      });

      // Send notification to helper
      const noteSection = note ? `\n\n📝 Note: ${note}` : "";
      const guideLink = "\n\n📖 Payroll Helper Guide: /payroll-helper-guide";
      await supabase.from('notifications').insert({
        user_id: selectedHelper.user_id,
        title: "💎 Diamond Topup Received!",
        message: `You have received ${diamondAmount.toLocaleString()} Trader Diamonds!\n\n💎 Amount: ${diamondAmount.toLocaleString()} Diamonds\n💰 New Balance: ${((selectedHelper.wallet_balance || 0) + diamondAmount).toLocaleString()} Diamonds${noteSection}${guideLink}`,
        type: "reward",
        is_read: false,
        data: { amount: diamondAmount, action_url: '/payroll-helper-guide' }
      });

      toast({
        title: "Success! ✅",
        description: `${diamondAmount.toLocaleString()} 💎 diamonds added to ${selectedHelper.user?.display_name}'s trader wallet`,
      });

      // Reset
      setSelectedHelper(null);
      setAmount("");
      setNote("");
      setSearchQuery("");
      setSearchResults([]);
      loadRecentTopups();
    } catch (error: any) {
      console.error('Topup error:', error);
      toast({
        title: "Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Helper Diamond Topup</h3>
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">Admin Action</Badge>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchHelpers()}
                placeholder="Name, UID, or Agency Code..."
                className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <Button onClick={searchHelpers} disabled={searching} className="bg-cyan-600 hover:bg-cyan-700">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && !selectedHelper && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map((helper) => (
                <div
                  key={helper.id}
                  onClick={() => {
                    setSelectedHelper(helper);
                    setSearchResults([]);
                  }}
                  className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-lg cursor-pointer hover:bg-slate-700/80 transition-colors border border-slate-700"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={helper.user?.avatar_url} />
                    <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-white">{helper.user?.display_name}</p>
                    <p className="text-xs text-slate-400">
                      UID: {helper.user?.app_uid} • Level {helper.trader_level}
                      {helper.payroll_enabled && ' • Payroll ✓'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-cyan-400">
                      <Gem className="w-4 h-4" />
                      <span className="font-bold">{helper.wallet_balance?.toLocaleString()}</span>
                    </div>
                    {helper.country_code && (
                      <span className="text-[10px] text-slate-500">{helper.country_code}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Helper */}
          {selectedHelper && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl border border-cyan-500/30">
                <Avatar className="w-12 h-12 ring-2 ring-cyan-500">
                  <AvatarImage src={selectedHelper.user?.avatar_url} />
                  <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg">{selectedHelper.user?.display_name}</p>
                  <p className="text-sm text-slate-400">
                    UID: {selectedHelper.user?.app_uid} • Level {selectedHelper.trader_level}
                    {selectedHelper.payroll_enabled && ' • Payroll ✓'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Current Balance</p>
                  <div className="flex items-center gap-1 text-cyan-400 text-xl font-bold">
                    <Gem className="w-5 h-5" />
                    {selectedHelper.wallet_balance?.toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedHelper(null);
                    setSearchResults([]);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </Button>
              </div>

              {/* Amount Input */}
              <div>
                <Label className="text-slate-300">Diamond Amount 💎</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter diamond amount..."
                  className="mt-1 bg-slate-800 border-slate-600 text-white text-lg font-bold placeholder:text-slate-500"
                  min="1"
                />
                {amount && parseInt(amount) > 0 && (
                  <p className="text-sm text-emerald-400 mt-1">
                    New Balance: {((selectedHelper.wallet_balance || 0) + parseInt(amount)).toLocaleString()} 💎
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <Label className="text-slate-300">Note (Optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for topup..."
                  className="mt-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleTopup}
                disabled={processing || !amount || parseInt(amount) <= 0}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-3"
                size="lg"
              >
                {processing ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <><Send className="w-5 h-5 mr-2" /> Add {amount ? parseInt(amount).toLocaleString() : '0'} 💎 Diamonds</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Topups */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-white">Recent Diamond Topups</h3>
          </div>
          {recentTopups.length === 0 ? (
            <p className="text-center text-slate-500 py-6">No recent topups</p>
          ) : (
            <div className="space-y-2">
              {recentTopups.map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={log.helper?.user?.avatar_url} />
                    <AvatarFallback><User className="w-3 h-3" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {log.helper?.user?.display_name || 'Helper'}
                    </p>
                    {log.note && (
                      <p className="text-xs text-slate-500 truncate">{log.note}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-emerald-400 font-bold">
                      <span>+{log.amount?.toLocaleString()}</span>
                      <Gem className="w-3 h-3" />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminHelperDiamondTopup;
