import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  Edit, 
  CreditCard, 
  Phone, 
  User, 
  Globe, 
  Wallet,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Diamond
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface HelperPaymentMethod {
  id: string;
  helper_id: string;
  country_code: string;
  country_name?: string;
  payment_method_name?: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
  logo_url: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  additional_info?: any;
  helper?: {
    id: string;
    user_id: string;
    wallet_balance: number;
    trader_level: number;
    user?: {
      display_name: string;
      avatar_url: string;
      app_uid: string;
    };
  };
}

interface Level5Helper {
  id: string;
  user_id: string;
  wallet_balance: number;
  trader_level: number;
  user?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
  };
}

const COUNTRY_OPTIONS = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "NP", name: "Nepal" },
  { code: "LK", name: "Sri Lanka" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
];

const METHOD_TYPES = [
  { value: "mobile_banking", label: "Mobile Banking (bKash, Nagad, etc.)" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI (India)" },
  { value: "wallet", label: "E-Wallet" },
  { value: "crypto", label: "Cryptocurrency" },
  { value: "other", label: "Other" },
];

export default function AdminHelperPaymentMethods() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<HelperPaymentMethod[]>([]);
  const [level5Helpers, setLevel5Helpers] = useState<Level5Helper[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<HelperPaymentMethod | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterHelper, setFilterHelper] = useState<string>("all");

  // Form state
  const [formData, setFormData] = useState({
    helper_id: "",
    country_code: "",
    method_name: "",
    method_type: "mobile_banking",
    account_name: "",
    account_number: "",
    bank_name: "",
    instructions: "",
    logo_url: "",
    min_amount: "",
    max_amount: "",
    is_active: true,
    display_order: "0"
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch all Level 5 helpers
    const { data: helpers, error: helpersError } = await supabase
      .from('topup_helpers')
      .select(`
        id,
        user_id,
        wallet_balance,
        trader_level,
        user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
      `)
      .eq('trader_level', 5)
      .eq('is_verified', true);

    if (!helpersError && helpers) {
      setLevel5Helpers(helpers as unknown as Level5Helper[]);
    }

    // Fetch all payment methods
    const { data: methodsData, error: methodsError } = await supabase
      .from('helper_country_payment_methods')
      .select(`
        *,
        helper:topup_helpers!helper_country_payment_methods_helper_id_fkey(
          id,
          user_id,
          wallet_balance,
          trader_level,
          user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
        )
      `)
      .order('created_at', { ascending: false });

    if (!methodsError && methodsData) {
      setMethods(methodsData as unknown as HelperPaymentMethod[]);
    }

    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      helper_id: "",
      country_code: "",
      method_name: "",
      method_type: "mobile_banking",
      account_name: "",
      account_number: "",
      bank_name: "",
      instructions: "",
      logo_url: "",
      min_amount: "",
      max_amount: "",
      is_active: true,
      display_order: "0"
    });
    setEditingMethod(null);
  };

  const handleAddNew = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleEdit = (method: HelperPaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      helper_id: method.helper_id,
      country_code: method.country_code,
      method_name: method.method_name,
      method_type: method.method_type,
      account_name: method.account_name,
      account_number: method.account_number,
      bank_name: method.bank_name || "",
      instructions: method.instructions || "",
      logo_url: method.logo_url || "",
      min_amount: method.additional_info?.min_amount?.toString() || "",
      max_amount: method.additional_info?.max_amount?.toString() || "",
      is_active: method.is_active,
      display_order: method.display_order?.toString() || "0"
    });
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!formData.helper_id || !formData.method_name || !formData.account_number) {
      toast({
        title: "Missing Fields",
        description: "Please fill all required fields",
        variant: "destructive"
      });
      return;
    }

    // Resolve country_name from code
    const countryName = COUNTRY_OPTIONS.find(c => c.code === formData.country_code)?.name || formData.country_code;

    const payload = {
      helper_id: formData.helper_id,
      country_code: formData.country_code,
      country_name: countryName,
      payment_method_name: formData.method_name,
      method_name: formData.method_name,
      method_type: formData.method_type,
      account_name: formData.account_name,
      account_number: formData.account_number,
      bank_name: formData.bank_name || null,
      instructions: formData.instructions || null,
      logo_url: formData.logo_url || null,
      is_active: formData.is_active,
      display_order: parseInt(formData.display_order) || 0,
      additional_info: {
        min_amount: formData.min_amount ? parseFloat(formData.min_amount) : null,
        max_amount: formData.max_amount ? parseFloat(formData.max_amount) : null,
      }
    };

    let error;
    if (editingMethod) {
      const { error: updateError } = await supabase
        .from('helper_country_payment_methods')
        .update(payload)
        .eq('id', editingMethod.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('helper_country_payment_methods')
        .insert(payload as any);
      error = insertError;
    }

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: editingMethod ? "Updated" : "Added",
        description: `Payment method ${editingMethod ? 'updated' : 'added'} successfully`,
      });
      setShowAddDialog(false);
      resetForm();
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) return;

    const { error } = await supabase
      .from('helper_country_payment_methods')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Payment method deleted" });
      fetchData();
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('helper_country_payment_methods')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  // Filter methods
  const filteredMethods = methods.filter(m => {
    const matchesSearch = 
      m.method_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.account_number.includes(searchQuery) ||
      m.helper?.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = filterCountry === "all" || m.country_code === filterCountry;
    const matchesHelper = filterHelper === "all" || m.helper_id === filterHelper;
    return matchesSearch && matchesCountry && matchesHelper;
  });

  const formatBalance = (balance: number) => {
    if (balance >= 1000000) return `${(balance / 1000000).toFixed(1)}M`;
    if (balance >= 1000) return `${(balance / 1000).toFixed(0)}K`;
    return balance.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search methods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 w-48"
            />
          </div>
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="w-32 bg-slate-800 border-slate-700">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {COUNTRY_OPTIONS.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterHelper} onValueChange={setFilterHelper}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
              <SelectValue placeholder="Helper" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Helpers</SelectItem>
              {level5Helpers.map(h => (
                <SelectItem key={h.id} value={h.id}>
                  {(h.user as any)?.display_name || 'Helper'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAddNew} className="bg-gradient-to-r from-amber-500 to-orange-500">
          <Plus className="w-4 h-4 mr-2" />
          Add Payment Method
        </Button>
      </div>

      {/* Info Banner - AUTOMATIC VISIBILITY */}
      <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Diamond className="w-6 h-6 text-green-400 mt-0.5" />
            <div>
              <p className="text-green-200 font-bold">🔄 Automatic Visibility System</p>
              <p className="text-green-300/80 text-sm mt-1">
                ✅ <span className="font-bold">300,000+</span> Diamonds + <span className="font-bold">Online</span> = <span className="text-green-400 font-bold">AUTO SHOW</span> on Recharge page
              </p>
              <p className="text-red-300/80 text-sm">
                ❌ <span className="font-bold">Below 300,000</span> or <span className="font-bold">Offline</span> = <span className="text-red-400 font-bold">AUTO HIDE</span> from Recharge page
              </p>
              <p className="text-slate-400 text-xs mt-2">
                No manual toggle needed — everything is automatic based on balance!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Methods Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-300">Helper</TableHead>
                <TableHead className="text-slate-300">Country</TableHead>
                <TableHead className="text-slate-300">Method</TableHead>
                <TableHead className="text-slate-300">Account</TableHead>
                <TableHead className="text-slate-300">Balance</TableHead>
                <TableHead className="text-slate-300">Auto Status</TableHead>
                <TableHead className="text-slate-300 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMethods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                    No payment methods found
                  </TableCell>
                </TableRow>
              ) : (
                filteredMethods.map((method) => {
                  const walletBalance = method.helper?.wallet_balance || 0;
                  const hasMinBalance = walletBalance >= 300000;
                  // Auto visibility is purely based on balance - no manual toggle needed
                  const isAutoVisible = hasMinBalance;

                  return (
                    <TableRow key={method.id} className={`border-slate-700 ${!isAutoVisible ? 'opacity-60' : ''}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={(method.helper?.user as any)?.avatar_url} />
                            <AvatarFallback className="bg-slate-700">
                              {(method.helper?.user as any)?.display_name?.[0] || 'H'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white text-sm font-medium">
                              {(method.helper?.user as any)?.display_name || 'Unknown'}
                            </p>
                            <p className="text-slate-400 text-xs">
                              L{method.helper?.trader_level || 5}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-600">
                          {COUNTRY_OPTIONS.find(c => c.code === method.country_code)?.name || method.country_code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-white text-sm">{method.method_name}</p>
                          <p className="text-slate-400 text-xs">{method.method_type}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-white text-sm font-mono">{method.account_number}</p>
                          <p className="text-slate-400 text-xs">{method.account_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Diamond className={`w-4 h-4 ${hasMinBalance ? 'text-cyan-400' : 'text-red-400'}`} />
                          <span className={hasMinBalance ? 'text-cyan-400 font-bold' : 'text-red-400'}>
                            {formatBalance(walletBalance)}
                          </span>
                        </div>
                        {!hasMinBalance && (
                          <p className="text-red-400 text-xs">Below 300K</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* AUTO STATUS - No manual toggle, based purely on balance */}
                        <div className="flex flex-col items-start gap-1">
                          {isAutoVisible ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              AUTO VISIBLE
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                              <XCircle className="w-3 h-3 mr-1" />
                              AUTO HIDDEN
                            </Badge>
                          )}
                          <p className="text-slate-500 text-xs">
                            {isAutoVisible ? 'Showing in Recharge' : 'Hidden (need 300K+)'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(method)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(method.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingMethod ? 'Edit Payment Method' : 'Add New Payment Method'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Helper Selection */}
            <div>
              <Label className="text-slate-300">Level 5 Helper *</Label>
              <Select value={formData.helper_id} onValueChange={(v) => setFormData(prev => ({ ...prev, helper_id: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Select Helper" />
                </SelectTrigger>
                <SelectContent>
                  {level5Helpers.map(h => (
                    <SelectItem key={h.id} value={h.id}>
                      <div className="flex items-center gap-2">
                        <span>{(h.user as any)?.display_name || 'Helper'}</span>
                        <Badge variant="outline" className="text-xs">
                          {formatBalance(h.wallet_balance)} 💎
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Country */}
            <div>
              <Label className="text-slate-300">Country *</Label>
              <Select value={formData.country_code} onValueChange={(v) => setFormData(prev => ({ ...prev, country_code: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Method Type */}
            <div>
              <Label className="text-slate-300">Method Type *</Label>
              <Select value={formData.method_type} onValueChange={(v) => setFormData(prev => ({ ...prev, method_type: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Method Name */}
            <div>
              <Label className="text-slate-300">Method Name *</Label>
              <Input
                value={formData.method_name}
                onChange={(e) => setFormData(prev => ({ ...prev, method_name: e.target.value }))}
                placeholder="e.g., bKash, Nagad, PayTM"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Account Name */}
            <div>
              <Label className="text-slate-300">Account Name *</Label>
              <Input
                value={formData.account_name}
                onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                placeholder="Account holder name"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Account Number */}
            <div>
              <Label className="text-slate-300">Account/Phone Number *</Label>
              <Input
                value={formData.account_number}
                onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                placeholder="01XXXXXXXXX"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Bank Name */}
            <div>
              <Label className="text-slate-300">Bank Name (optional)</Label>
              <Input
                value={formData.bank_name}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="For bank transfers"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Instructions */}
            <div>
              <Label className="text-slate-300">Instructions (optional)</Label>
              <Textarea
                value={formData.instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder="Payment instructions for users"
                className="bg-slate-800 border-slate-700"
                rows={3}
              />
            </div>

            {/* Logo URL */}
            <div>
              <Label className="text-slate-300">Logo URL (optional)</Label>
              <Input
                value={formData.logo_url}
                onChange={(e) => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                placeholder="https://..."
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-500">
              {editingMethod ? 'Update' : 'Add'} Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
