import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Save, CreditCard, Globe, Settings, DollarSign, Search, FileText, TrendingUp, Upload, Camera, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { adminSendNotification } from "@/utils/adminNotification";

interface PaymentGateway {
  id: string;
  name: string;
  gateway_code: string;
  gateway_type?: string | null;
  description: string | null;
  logo_url: string | null;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  secret_key_encrypted: string | null;
  webhook_url: string | null;
  supported_currencies: string[];
  country_codes: string[] | null;
  is_integrated: boolean;
  min_amount: number;
  max_amount: number;
  fee_percentage: number;
  fee_fixed: number;
  is_active: boolean;
  display_order: number;
  settings: any;
  created_at: string;
}

// Common country options for the picker
const ADMIN_COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: "GLOBAL", name: "🌍 Global (All countries)" },
  { code: "BD", name: "🇧🇩 Bangladesh" },
  { code: "IN", name: "🇮🇳 India" },
  { code: "PK", name: "🇵🇰 Pakistan" },
  { code: "NP", name: "🇳🇵 Nepal" },
  { code: "LK", name: "🇱🇰 Sri Lanka" },
  { code: "PH", name: "🇵🇭 Philippines" },
  { code: "ID", name: "🇮🇩 Indonesia" },
  { code: "MY", name: "🇲🇾 Malaysia" },
  { code: "TH", name: "🇹🇭 Thailand" },
  { code: "VN", name: "🇻🇳 Vietnam" },
  { code: "MM", name: "🇲🇲 Myanmar" },
  { code: "KH", name: "🇰🇭 Cambodia" },
  { code: "SG", name: "🇸🇬 Singapore" },
  { code: "HK", name: "🇭🇰 Hong Kong" },
  { code: "CN", name: "🇨🇳 China" },
  { code: "JP", name: "🇯🇵 Japan" },
  { code: "KR", name: "🇰🇷 South Korea" },
  { code: "TW", name: "🇹🇼 Taiwan" },
  { code: "AE", name: "🇦🇪 UAE" },
  { code: "SA", name: "🇸🇦 Saudi Arabia" },
  { code: "EG", name: "🇪🇬 Egypt" },
  { code: "NG", name: "🇳🇬 Nigeria" },
  { code: "KE", name: "🇰🇪 Kenya" },
  { code: "ZA", name: "🇿🇦 South Africa" },
  { code: "GH", name: "🇬🇭 Ghana" },
  { code: "TR", name: "🇹🇷 Turkey" },
  { code: "RU", name: "🇷🇺 Russia" },
  { code: "UA", name: "🇺🇦 Ukraine" },
  { code: "PL", name: "🇵🇱 Poland" },
  { code: "DE", name: "🇩🇪 Germany" },
  { code: "FR", name: "🇫🇷 France" },
  { code: "IT", name: "🇮🇹 Italy" },
  { code: "ES", name: "🇪🇸 Spain" },
  { code: "PT", name: "🇵🇹 Portugal" },
  { code: "GB", name: "🇬🇧 United Kingdom" },
  { code: "US", name: "🇺🇸 United States" },
  { code: "CA", name: "🇨🇦 Canada" },
  { code: "MX", name: "🇲🇽 Mexico" },
  { code: "BR", name: "🇧🇷 Brazil" },
  { code: "AR", name: "🇦🇷 Argentina" },
  { code: "CO", name: "🇨🇴 Colombia" },
  { code: "PE", name: "🇵🇪 Peru" },
  { code: "CL", name: "🇨🇱 Chile" },
  { code: "AU", name: "🇦🇺 Australia" },
  { code: "NZ", name: "🇳🇿 New Zealand" },
];

interface Transaction {
  id: string;
  user_id: string;
  gateway_id: string;
  transaction_ref: string | null;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  coins_to_receive: number;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
  gateway?: {
    id: string;
    name: string;
    gateway_code: string;
  } | null;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  } | null;
}

const AdminPaymentGateways = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("gateways");
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Logo Upload State
  const [uploadingLogoForGateway, setUploadingLogoForGateway] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Country filter for the gateway list
  const [countryFilter, setCountryFilter] = useState<string>("all");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    gateway_code: "",
    description: "",
    logo_url: "",
    api_endpoint: "",
    api_key: "",
    secret_key: "",
    webhook_url: "",
    supported_currencies: "",
    country_codes: [] as string[],
    is_integrated: true,
    min_amount: 1,
    max_amount: 10000,
    fee_percentage: 0,
    fee_fixed: 0,
    display_order: 0,
    is_active: false,
  });

  // Stats
  const [stats, setStats] = useState({
    totalTransactions: 0,
    pendingTransactions: 0,
    completedTransactions: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    fetchGateways();
    fetchTransactions();
    fetchStats();
  }, []);

  useAdminRealtime(['payment_gateways', 'payment_transactions'], () => {
    fetchGateways();
    fetchTransactions();
    fetchStats();
  });

  const fetchGateways = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_gateways')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      // The DB stores extra fields inside the JSONB `config` column.
      // Flatten them onto the gateway shape used by this admin UI.
      const mapped = (data || []).map((g: any) => {
        const cfg = (g.config || {}) as Record<string, any>;
        return {
          ...g,
          gateway_code: g.gateway_type || cfg.gateway_code || '',
          description: cfg.description ?? null,
          api_endpoint: cfg.api_endpoint ?? null,
          api_key_encrypted: cfg.api_key_encrypted ?? null,
          secret_key_encrypted: cfg.secret_key_encrypted ?? null,
          webhook_url: cfg.webhook_url ?? null,
          min_amount: Number(cfg.min_amount ?? 1),
          max_amount: Number(cfg.max_amount ?? 10000),
          fee_percentage: Number(cfg.fee_percentage ?? 0),
          fee_fixed: Number(cfg.fee_fixed ?? 0),
          settings: cfg.settings ?? null,
          country_codes: g.country_codes ?? null,
          is_integrated: g.is_integrated ?? false,
        } as PaymentGateway;
      });

      setGateways(mapped);
    } catch (error) {
      console.error('Error fetching gateways:', error);
      toast({
        title: "Error",
        description: "Failed to load payment gateways",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          gateway:payment_gateways(id, name, gateway_code),
          user:profiles(display_name, avatar_url, app_uid)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const [totalRes, pendingRes, completedRes, revenueRes] = await Promise.all([
        supabase.from('payment_transactions').select('*', { count: 'exact', head: true }),
        supabase.from('payment_transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payment_transactions').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('payment_transactions').select('amount_usd').eq('status', 'completed'),
      ]);

      const revenue = (revenueRes.data || []).reduce((sum, t) => sum + (t.amount_usd || 0), 0);

      setStats({
        totalTransactions: totalRes.count || 0,
        pendingTransactions: pendingRes.count || 0,
        completedTransactions: completedRes.count || 0,
        totalRevenue: revenue,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAdd = () => {
    setEditingGateway(null);
    setFormData({
      name: "",
      gateway_code: "",
      description: "",
      logo_url: "",
      api_endpoint: "",
      api_key: "",
      secret_key: "",
      webhook_url: "",
      supported_currencies: "USD",
      country_codes: [],
      is_integrated: true,
      min_amount: 1,
      max_amount: 10000,
      fee_percentage: 0,
      fee_fixed: 0,
      display_order: gateways.length,
      is_active: false,
    });
    setShowModal(true);
  };

  const handleEdit = (gateway: PaymentGateway) => {
    setEditingGateway(gateway);
    setFormData({
      name: gateway.name,
      gateway_code: gateway.gateway_code,
      description: gateway.description || "",
      logo_url: gateway.logo_url || "",
      api_endpoint: gateway.api_endpoint || "",
      api_key: "",
      secret_key: "",
      webhook_url: gateway.webhook_url || "",
      supported_currencies: gateway.supported_currencies.join(", "),
      country_codes: gateway.country_codes || [],
      is_integrated: gateway.is_integrated ?? true,
      min_amount: gateway.min_amount,
      max_amount: gateway.max_amount,
      fee_percentage: gateway.fee_percentage,
      fee_fixed: gateway.fee_fixed,
      display_order: gateway.display_order,
      is_active: gateway.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currencies = formData.supported_currencies
        .split(",")
        .map(c => c.trim().toUpperCase())
        .filter(c => c);

      // Top-level columns that exist on the table
      const gatewayCode = formData.gateway_code.toLowerCase().replace(/\s+/g, '_');

      // Everything else lives inside `config` JSONB
      const existingConfig = (editingGateway as any)?.config || {};
      const newConfig: Record<string, any> = {
        ...existingConfig,
        gateway_code: gatewayCode,
        description: formData.description || null,
        api_endpoint: formData.api_endpoint || null,
        webhook_url: formData.webhook_url || null,
        min_amount: formData.min_amount,
        max_amount: formData.max_amount,
        fee_percentage: formData.fee_percentage,
        fee_fixed: formData.fee_fixed,
      };
      if (formData.api_key) newConfig.api_key_encrypted = formData.api_key;
      if (formData.secret_key) newConfig.secret_key_encrypted = formData.secret_key;

      const gatewayData: any = {
        name: formData.name,
        gateway_type: gatewayCode,
        logo_url: formData.logo_url || null,
        supported_currencies: currencies,
        country_codes: formData.country_codes && formData.country_codes.length > 0 ? formData.country_codes : null,
        is_integrated: formData.is_integrated,
        display_order: formData.display_order,
        is_active: formData.is_active,
        config: newConfig,
      };

      if (editingGateway) {
        const { error } = await supabase
          .from('payment_gateways')
          .update(gatewayData)
          .eq('id', editingGateway.id);

        if (error) throw error;
        toast({ title: "Success", description: "Payment gateway updated" });
      } else {
        const { error } = await supabase
          .from('payment_gateways')
          .insert(gatewayData);

        if (error) throw error;
        toast({ title: "Success", description: "New payment gateway added" });
      }

      setShowModal(false);
      fetchGateways();
    } catch (error: any) {
      console.error('Error saving gateway:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save payment gateway",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (gateway: PaymentGateway) => {
    try {
      const { error } = await supabase
        .from('payment_gateways')
        .update({ is_active: !gateway.is_active })
        .eq('id', gateway.id);

      if (error) throw error;
      
      toast({
        title: gateway.is_active ? "Deactivated" : "Activated",
        description: `${gateway.name} has been ${gateway.is_active ? 'deactivated' : 'activated'}`
      });
      
      fetchGateways();
    } catch (error) {
      console.error('Error toggling gateway:', error);
      toast({
        title: "Error",
        description: "Failed to update gateway status",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (gateway: PaymentGateway) => {
    if (!confirm(`Do you want to delete "${gateway.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('payment_gateways')
        .delete()
        .eq('id', gateway.id);

      if (error) throw error;
      toast({ title: "Success", description: "Payment gateway deleted" });
      fetchGateways();
    } catch (error) {
      console.error('Error deleting gateway:', error);
      toast({
        title: "Error",
        description: "Failed to delete payment gateway",
        variant: "destructive"
      });
    }
  };

  const handleUpdateTransactionStatus = async (transactionId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
        
        // Get transaction details to add coins
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction) {
          // Add coins to user
          const { error: coinError } = await supabase.rpc('admin_add_user_coins' as any, {
            _user_id: transaction.user_id,
            _amount: transaction.coins_to_receive
          });
          
          if (coinError) {
            // Fallback: Atomic coin addition (race-condition safe)
            await supabase.rpc('add_coins', {
              p_user_id: transaction.user_id,
              p_amount: transaction.coins_to_receive,
            });
          }

          // Send notification to user about direct recharge
          const coinAmount = transaction.coins_to_receive;
          const formattedAmount = coinAmount >= 100000 
            ? `${(coinAmount / 100000).toFixed(1)}L` 
            : coinAmount.toLocaleString();
          
          await adminSendNotification(transaction.user_id, '💎 Recharge Complete!', `${formattedAmount} diamonds successfully recharged!`, 'coin_purchase_direct')
        }
      }

      const { error } = await supabase
        .from('payment_transactions')
        .update(updateData)
        .eq('id', transactionId);

      if (error) throw error;

      toast({ title: "Success", description: "Transaction status updated" });
      fetchTransactions();
      fetchStats();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update transaction",
        variant: "destructive"
      });
    }
  };

  // Logo Upload Handler - Direct click on logo icon
  const handleLogoUpload = async (file: File, gatewayId: string) => {
    setUploadingLogoForGateway(gatewayId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `payment-gateway-logo-${gatewayId}-${Date.now()}.${fileExt}`;
      const filePath = `payment-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-logos')
        .getPublicUrl(filePath);

      // Update gateway with new logo URL
      const { error: updateError } = await supabase
        .from('payment_gateways')
        .update({ logo_url: publicUrl })
        .eq('id', gatewayId);

      if (updateError) throw updateError;

      toast({
        title: "✓ Logo Upload Successful",
        description: "Payment gateway logo has been updated",
      });

      fetchGateways();
    } catch (error: any) {
      console.error('Logo upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload logo",
        variant: "destructive"
      });
    } finally {
      setUploadingLogoForGateway(null);
    }
  };

  const handleLogoInputChange = (e: React.ChangeEvent<HTMLInputElement>, gatewayId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Only image files can be uploaded",
          variant: "destructive"
        });
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Maximum file size is 2MB",
          variant: "destructive"
        });
        return;
      }
      handleLogoUpload(file, gatewayId);
    }
    // Reset input
    e.target.value = '';
  };

  const getGatewayIcon = (code: string) => {
    const icons: Record<string, string> = {
      bkash: "💜",
      nagad: "🧡",
      rocket: "💙",
      stripe: "💳",
      paypal: "🅿️",
      upi: "🇮🇳",
      paytm: "💰",
      jazzcash: "🟢",
      easypaisa: "🟠",
    };
    return icons[code] || "💳";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
      case 'cancelled':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = !searchQuery || 
      t.transaction_ref?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.user?.app_uid?.includes(searchQuery);
    
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate('/admin')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-white">Payment System</h1>
            <p className="text-white/80 text-sm">Gateway & Transaction Management</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.totalTransactions}</p>
            <p className="text-white/80 text-xs">Total</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-yellow-200">{stats.pendingTransactions}</p>
            <p className="text-white/80 text-xs">Pending</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-200">{stats.completedTransactions}</p>
            <p className="text-white/80 text-xs">Completed</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-white">${stats.totalRevenue.toFixed(0)}</p>
            <p className="text-white/80 text-xs">Revenue</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 -mt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-slate-800 shadow-md rounded-xl p-1 border border-slate-700">
            <TabsTrigger 
              value="gateways" 
              className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white text-white/70 rounded-lg"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Gateways
            </TabsTrigger>
            <TabsTrigger 
              value="transactions"
              className="flex-1 data-[state=active]:bg-pink-500 data-[state=active]:text-white text-white/70 rounded-lg"
            >
              <FileText className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Gateways Tab */}
          <TabsContent value="gateways" className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-white/70" />
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white"
                >
                  <option value="all">All countries</option>
                  {ADMIN_COUNTRY_OPTIONS.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
                <span className="text-xs text-white/50">
                  {(() => {
                    const visible = countryFilter === 'all'
                      ? gateways.length
                      : gateways.filter(g => (g.country_codes || []).includes(countryFilter)).length;
                    return `${visible} gateway${visible === 1 ? '' : 's'}`;
                  })()}
                </span>
              </div>
              <Button onClick={handleAdd} className="gap-2 bg-pink-500 hover:bg-pink-600">
                <Plus className="w-4 h-4" />
                New Gateway
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-white/60">Loading...</div>
            ) : gateways.length === 0 ? (
              <div className="text-center py-12 bg-slate-800 rounded-2xl border border-slate-700">
                <CreditCard className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-white/60">No payment gateways found</p>
                <Button onClick={handleAdd} className="mt-4 bg-pink-500 hover:bg-pink-600">
                  Add First Gateway
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {gateways
                  .filter(g => countryFilter === 'all' || (g.country_codes || []).includes(countryFilter))
                  .map((gateway) => (
                  <Card key={gateway.id} className={cn(
                    "transition-all border shadow-sm",
                    gateway.is_active 
                      ? "bg-slate-800 border-green-500/30" 
                      : "bg-slate-800/50 border-slate-700"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Clickable Logo Area with Upload */}
                        <label className="relative cursor-pointer group">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleLogoInputChange(e, gateway.id)}
                            disabled={uploadingLogoForGateway === gateway.id}
                          />
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-inner transition-all overflow-hidden",
                            gateway.logo_url 
                              ? "bg-white border-2 border-slate-600" 
                              : "bg-gradient-to-br from-slate-700 to-slate-600",
                            "group-hover:ring-2 group-hover:ring-pink-500 group-hover:ring-offset-2 group-hover:ring-offset-slate-800"
                          )}>
                            {uploadingLogoForGateway === gateway.id ? (
                              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                            ) : gateway.logo_url ? (
                              <img 
                                src={gateway.logo_url} 
                                alt={gateway.name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              getGatewayIcon(gateway.gateway_code)
                            )}
                          </div>
                          {/* Upload Overlay on Hover */}
                          <div className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </label>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-bold text-white">{gateway.name}</h3>
                            <Badge variant={gateway.is_active ? "default" : "secondary"} className={gateway.is_active ? "bg-green-500" : "bg-slate-600"}>
                              {gateway.is_active ? "Active" : "Inactive"}
                            </Badge>
                            {gateway.is_integrated ? (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ⚡ Auto Integrated
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                📝 Manual
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-white/60 mb-2">{gateway.description}</p>
                          
                          <div className="flex flex-wrap gap-2 text-xs">
                            {(gateway.country_codes || []).length > 0 ? (
                              (gateway.country_codes || []).map((cc) => (
                                <span key={cc} className="bg-purple-500/20 text-purple-200 px-2 py-1 rounded-full border border-purple-500/30">
                                  {cc === 'GLOBAL' ? '🌍 Global' : cc}
                                </span>
                              ))
                            ) : (
                              <span className="bg-slate-700 text-white/40 px-2 py-1 rounded-full border border-slate-600">
                                No country
                              </span>
                            )}
                            <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full flex items-center gap-1 border border-blue-500/30">
                              <Globe className="w-3 h-3" />
                              {gateway.supported_currencies.join(", ")}
                            </span>
                            {gateway.fee_percentage > 0 && (
                              <span className="bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full flex items-center gap-1 border border-orange-500/30">
                                <DollarSign className="w-3 h-3" />
                                {gateway.fee_percentage}% Fee
                              </span>
                            )}
                            <span className="bg-slate-700 text-white/60 px-2 py-1 rounded-full border border-slate-600">
                              {gateway.gateway_code}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(gateway)}
                            className={gateway.is_active ? "text-green-400 hover:text-green-300" : "text-slate-500 hover:text-slate-400"}
                          >
                            {gateway.is_active ? (
                              <ToggleRight className="w-6 h-6" />
                            ) : (
                              <ToggleLeft className="w-6 h-6" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(gateway)}
                            className="text-white/60 hover:text-white"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(gateway)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-4">
            {/* Search & Filter */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="Search by Transaction ID or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-white/40"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Transactions List */}
            <div className="space-y-3">
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 bg-slate-800 rounded-2xl border border-slate-700">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-white/60">No transactions found</p>
                </div>
              ) : (
                filteredTransactions.map((txn) => (
                  <Card key={txn.id} className="bg-slate-800 border-slate-700">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center border border-pink-500/30">
                          {txn.gateway && getGatewayIcon(txn.gateway.gateway_code)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">
                                {txn.user?.display_name || 'Unknown User'}
                              </span>
                              {txn.user?.app_uid && (
                                <span className="text-xs text-white/40">#{txn.user.app_uid}</span>
                              )}
                            </div>
                            {getStatusBadge(txn.status || 'pending')}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-white/70 mb-2">
                            <span className="font-medium text-pink-400">
                              💎 {txn.coins_to_receive.toLocaleString()} coins
                            </span>
                            <span>${txn.amount_usd.toFixed(2)}</span>
                            <span>{txn.currency_code} {txn.amount_local.toFixed(2)}</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-white/40">
                              <span>Ref: {txn.transaction_ref || 'N/A'}</span>
                              <span className="mx-2">•</span>
                              <span>{txn.created_at ? new Date(txn.created_at).toLocaleString('en-US') : '-'}</span>
                            </div>
                            
                            {txn.status === 'pending' && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                                  onClick={() => handleUpdateTransactionStatus(txn.id, 'completed')}
                                >
                                  ✓ Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                                  onClick={() => handleUpdateTransactionStatus(txn.id, 'failed')}
                                >
                                  ✗ Reject
                                </Button>
                              </div>
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
        </Tabs>
      </div>

      {/* Add/Edit Gateway Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-800">
              {editingGateway ? "Edit Payment Gateway" : "New Payment Gateway"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700">Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="bKash"
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-700">Code *</Label>
                <Input
                  value={formData.gateway_code}
                  onChange={(e) => setFormData({ ...formData, gateway_code: e.target.value })}
                  placeholder="bkash"
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-700">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description about the payment gateway"
                className="bg-slate-50 border-slate-200"
              />
            </div>

            <div>
              <Label className="text-slate-700">Supported Currencies (comma separated)</Label>
              <Input
                value={formData.supported_currencies}
                onChange={(e) => setFormData({ ...formData, supported_currencies: e.target.value })}
                placeholder="BDT, USD"
                className="bg-slate-50 border-slate-200"
              />
            </div>

            {/* Country Codes Multi-Picker */}
            <div>
              <Label className="text-slate-700">
                Available Countries
                <span className="text-xs text-slate-500 ml-2">
                  (Helpers from these countries will see this gateway)
                </span>
              </Label>
              <div className="mt-2 flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-44 overflow-y-auto">
                {ADMIN_COUNTRY_OPTIONS.map((c) => {
                  const checked = formData.country_codes.includes(c.code);
                  return (
                    <button
                      type="button"
                      key={c.code}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          country_codes: checked
                            ? formData.country_codes.filter((x) => x !== c.code)
                            : [...formData.country_codes, c.code],
                        })
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition",
                        checked
                          ? "bg-pink-500 text-white border-pink-500"
                          : "bg-white text-slate-700 border-slate-300 hover:border-pink-400"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Selected: {formData.country_codes.length === 0 ? 'None — gateway will be hidden' : formData.country_codes.join(', ')}
              </p>
            </div>

            {/* Auto-Integrated Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <Label className="text-slate-700">Auto Integration</Label>
                <p className="text-sm text-slate-500">
                  ON = Helpers can use this gateway with API key/secret. OFF = manual screenshot only.
                </p>
              </div>
              <Switch
                checked={formData.is_integrated}
                onCheckedChange={(checked) => setFormData({ ...formData, is_integrated: checked })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700">API Endpoint</Label>
                <Input
                  value={formData.api_endpoint}
                  onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
                  placeholder="https://api.example.com"
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-700">Webhook URL</Label>
                <Input
                  value={formData.webhook_url}
                  onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                  placeholder="https://yoursite.com/webhook"
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700">API Key</Label>
                <Input
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder={editingGateway ? "Enter new key (optional)" : "API Key"}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-700">Secret Key</Label>
                <Input
                  type="password"
                  value={formData.secret_key}
                  onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                  placeholder={editingGateway ? "Enter new key (optional)" : "Secret Key"}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700">Minimum Amount (USD)</Label>
                <Input
                  type="number"
                  value={formData.min_amount}
                  onChange={(e) => setFormData({ ...formData, min_amount: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-700">Maximum Amount (USD)</Label>
                <Input
                  type="number"
                  value={formData.max_amount}
                  onChange={(e) => setFormData({ ...formData, max_amount: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-700">Fee Percentage (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.fee_percentage}
                  onChange={(e) => setFormData({ ...formData, fee_percentage: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-slate-700">Fixed Fee (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.fee_fixed}
                  onChange={(e) => setFormData({ ...formData, fee_fixed: parseFloat(e.target.value) || 0 })}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <Label className="text-slate-700">Enable</Label>
                <p className="text-sm text-slate-500">Users will be able to use this gateway</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="gap-2 bg-pink-500 hover:bg-pink-600">
              <Save className="w-4 h-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPaymentGateways;
