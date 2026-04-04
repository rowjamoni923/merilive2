import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { 
  Plus, Edit, Trash2, CreditCard, Smartphone, Bitcoin, Wallet, 
  ArrowUp, ArrowDown, ToggleLeft, ToggleRight, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
  icon_url: string | null;
  qr_code_url: string | null;
  min_amount: number;
  max_amount: number;
  display_order: number;
  is_active: boolean;
}

const AdminTopupPaymentMethods = () => {
  const { toast } = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    method_name: '',
    method_type: 'mobile_wallet',
    account_name: '',
    account_number: '',
    bank_name: '',
    instructions: '',
    icon_url: '',
    qr_code_url: '',
    min_amount: 10,
    max_amount: 10000
  });

  const loadMethods = useCallback(async () => {
    console.log('[AdminPaymentMethods] Loading payment methods...');
    try {
      const { data, error } = await supabase
        .from('topup_payment_methods')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('[AdminPaymentMethods] Error loading methods:', error);
        toast({ title: "Error loading methods", description: error.message, variant: "destructive" });
      } else {
        console.log('[AdminPaymentMethods] Loaded methods:', data?.length, data);
        setMethods((data || []) as PaymentMethod[]);
      }
    } catch (err) {
      console.error('[AdminPaymentMethods] Unexpected error:', err);
    }
    setLoading(false);
  }, [toast]);

  // Initial load + Real-time subscription
  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  useAdminRealtime(['topup_payment_methods'], loadMethods);

  const handleSubmit = async () => {
    if (!formData.method_name || !formData.account_name || !formData.account_number) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    setSaving(true);
    console.log('[AdminPaymentMethods] Starting save...', { editing: !!editingMethod, formData });
    
    try {
      if (editingMethod) {
        console.log('[AdminPaymentMethods] Updating method:', editingMethod.id);
        
        const updateData = {
          method_name: formData.method_name,
          method_type: formData.method_type,
          account_name: formData.account_name,
          account_number: formData.account_number,
          bank_name: formData.bank_name || null,
          instructions: formData.instructions || null,
          icon_url: formData.icon_url || null,
          qr_code_url: formData.qr_code_url || null,
          min_amount: formData.min_amount,
          max_amount: formData.max_amount,
          updated_at: new Date().toISOString()
        };
        
        console.log('[AdminPaymentMethods] Update payload:', updateData);
        
        const { data, error } = await supabase
          .from('topup_payment_methods')
          .update(updateData)
          .eq('id', editingMethod.id)
          .select();

        console.log('[AdminPaymentMethods] Update response:', { data, error });

        if (error) {
          console.error('[AdminPaymentMethods] Update error:', error);
          toast({ 
            title: "Update failed", 
            description: `Error: ${error.message} (Code: ${error.code})`, 
            variant: "destructive" 
          });
          return;
        }

        if (!data || data.length === 0) {
          console.warn('[AdminPaymentMethods] Update returned no data - may need RLS check');
          toast({ 
            title: "Warning", 
            description: "Update may not have been applied. Please refresh and check.", 
            variant: "destructive" 
          });
        } else {
          console.log('[AdminPaymentMethods] Update successful:', data);
          toast({ title: "Payment method updated! ✅" });
        }
      } else {
        const insertData = {
          method_name: formData.method_name,
          method_type: formData.method_type,
          account_name: formData.account_name,
          account_number: formData.account_number,
          bank_name: formData.bank_name || null,
          instructions: formData.instructions || null,
          icon_url: formData.icon_url || null,
          qr_code_url: formData.qr_code_url || null,
          min_amount: formData.min_amount,
          max_amount: formData.max_amount,
          display_order: methods.length,
          is_active: true
        };
        
        console.log('[AdminPaymentMethods] Insert payload:', insertData);
        
        const { data, error } = await supabase
          .from('topup_payment_methods')
          .insert(insertData)
          .select();

        console.log('[AdminPaymentMethods] Insert response:', { data, error });

        if (error) {
          console.error('[AdminPaymentMethods] Insert error:', error);
          toast({ 
            title: "Add failed", 
            description: `Error: ${error.message} (Code: ${error.code})`, 
            variant: "destructive" 
          });
          return;
        }

        console.log('[AdminPaymentMethods] Insert successful:', data);
        toast({ title: "Payment method added! ✅" });
      }

      setShowDialog(false);
      resetForm();
      await loadMethods();
    } catch (error: any) {
      console.error('[AdminPaymentMethods] Submit error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      method_name: method.method_name,
      method_type: method.method_type,
      account_name: method.account_name,
      account_number: method.account_number,
      bank_name: method.bank_name || '',
      instructions: method.instructions || '',
      icon_url: method.icon_url || '',
      qr_code_url: method.qr_code_url || '',
      min_amount: method.min_amount,
      max_amount: method.max_amount
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) return;

    const { error } = await supabase
      .from('topup_payment_methods')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Payment method deleted ✅" });
    loadMethods();
  };

  const handleToggleActive = async (method: PaymentMethod) => {
    console.log('[AdminPaymentMethods] Toggling active status for:', method.id, '-> ', !method.is_active);
    const { data, error } = await supabase
      .from('topup_payment_methods')
      .update({ is_active: !method.is_active, updated_at: new Date().toISOString() })
      .eq('id', method.id)
      .select();
    
    console.log('[AdminPaymentMethods] Toggle result:', { data, error });

    if (error) {
      toast({ title: "Toggle failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: method.is_active ? "Method deactivated" : "Method activated ✅" });
    loadMethods();
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const newMethods = [...methods];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= methods.length) return;
    
    [newMethods[index], newMethods[targetIndex]] = [newMethods[targetIndex], newMethods[index]];
    
    // Update display_order for both
    await Promise.all([
      supabase.from('topup_payment_methods').update({ display_order: index }).eq('id', newMethods[index].id),
      supabase.from('topup_payment_methods').update({ display_order: targetIndex }).eq('id', newMethods[targetIndex].id)
    ]);
    
    loadMethods();
  };

  const resetForm = () => {
    setEditingMethod(null);
    setFormData({
      method_name: '',
      method_type: 'mobile_wallet',
      account_name: '',
      account_number: '',
      bank_name: '',
      instructions: '',
      icon_url: '',
      qr_code_url: '',
      min_amount: 10,
      max_amount: 10000
    });
  };

  const getMethodIcon = (type: string) => {
    switch (type) {
      case 'mobile_wallet': return Smartphone;
      case 'bank': return CreditCard;
      case 'crypto': return Bitcoin;
      default: return Wallet;
    }
  };

  const getMethodColor = (type: string) => {
    switch (type) {
      case 'mobile_wallet': return 'bg-pink-500/20 text-pink-400';
      case 'bank': return 'bg-blue-500/20 text-blue-400';
      case 'crypto': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-purple-500/20 text-purple-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Top-up Payment Methods</h1>
            <p className="text-slate-400">Manage payment methods for manual top-up</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => loadMethods()}
              className="border-slate-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button 
              onClick={() => { resetForm(); setShowDialog(true); }}
              className="bg-gradient-to-r from-emerald-500 to-teal-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Method
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {methods.map((method, index) => {
              const Icon = getMethodIcon(method.method_type);
              return (
                <Card key={method.id} className={`bg-slate-800/50 border-slate-700 ${!method.is_active ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => handleReorder(index, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => handleReorder(index, 'down')}
                          disabled={index === methods.length - 1}
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getMethodColor(method.method_type)}`}>
                        <Icon className="w-6 h-6" />
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-semibold">{method.method_name}</p>
                          <Badge className={getMethodColor(method.method_type)}>
                            {method.method_type.replace('_', ' ')}
                          </Badge>
                          {!method.is_active && (
                            <Badge variant="outline" className="text-red-400 border-red-400">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-slate-400 text-sm">{method.account_name}</p>
                        <p className="text-slate-500 text-xs">{method.account_number}</p>
                      </div>

                      {/* Amount range */}
                      <div className="text-right">
                        <p className="text-white text-sm">${method.min_amount} - ${method.max_amount}</p>
                        <p className="text-slate-500 text-xs">Amount range</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(method)}
                          className={method.is_active ? 'text-green-400' : 'text-slate-400'}
                        >
                          {method.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(method)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(method.id)} className="text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {methods.length === 0 && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-10 text-center">
                  <CreditCard className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400">No payment methods configured</p>
                  <p className="text-slate-500 text-sm">Add payment methods for users to top-up</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Method Name *</Label>
                  <Input
                    value={formData.method_name}
                    onChange={(e) => setFormData({ ...formData, method_name: e.target.value })}
                    placeholder="e.g., bKash, Binance"
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Type *</Label>
                  <Select value={formData.method_type} onValueChange={(v) => setFormData({ ...formData, method_type: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile_wallet">Mobile Wallet</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="ewallet">E-Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-white">Account Name *</Label>
                <Input
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  placeholder="Account holder name"
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-white">Account Number / ID *</Label>
                <Input
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  placeholder="Phone number, account number, or Pay ID"
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-white">Bank Name (if applicable)</Label>
                <Input
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="e.g., Dutch Bangla Bank"
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-white">Instructions</Label>
                <Textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder="Payment instructions for users..."
                  className="bg-slate-800 border-slate-700 text-white mt-1"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Min Amount ($)</Label>
                  <Input
                    type="number"
                    value={formData.min_amount}
                    onChange={(e) => setFormData({ ...formData, min_amount: parseInt(e.target.value) || 10 })}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Max Amount ($)</Label>
                  <Input
                    type="number"
                    value={formData.max_amount}
                    onChange={(e) => setFormData({ ...formData, max_amount: parseInt(e.target.value) || 10000 })}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500"
                >
                  {saving ? 'Saving...' : (editingMethod ? 'Update' : 'Add Method')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default AdminTopupPaymentMethods;
