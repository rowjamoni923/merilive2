import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  Plus, Edit, Trash2, CreditCard, Smartphone, Bitcoin, Wallet,
  ArrowUp, ArrowDown, ToggleLeft, ToggleRight, RefreshCw, Upload, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethod {
  id: string;
  name: string;
  method_type: string;
  account_name: string | null;
  account_number: string | null;
  payment_number: string | null;
  payment_instructions: string | null;
  icon_url: string | null;
  display_order: number | null;
  is_active: boolean | null;
}

const METHOD_TYPES = [
  { value: 'mobile_banking', label: 'Mobile Banking' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'epay', label: 'ePay' },
  { value: 'binance', label: 'Binance Pay' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'digital', label: 'Digital Wallet' },
];

const AdminTopupPaymentMethods = () => {
  const { toast } = useToast();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    method_type: 'mobile_banking',
    account_name: '',
    account_number: '',
    payment_number: '',
    payment_instructions: '',
    icon_url: '',
  });

  const loadMethods = useCallback(async () => {
    console.log('[AdminPaymentMethods] Loading...');
    try {
      const { data, error } = await supabase
        .from('topup_payment_methods')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('[AdminPaymentMethods] Load error:', error);
        toast({ title: "Error loading methods", description: error.message, variant: "destructive" });
      } else {
        setMethods((data || []) as PaymentMethod[]);
      }
    } catch (err: any) {
      console.error('[AdminPaymentMethods] Unexpected error:', err);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadMethods(); }, [loadMethods]);
  useAdminRealtime(['topup_payment_methods'], loadMethods, { enableRealtimeRefresh: true });

  const resetForm = () => {
    setEditingMethod(null);
    setFormData({
      name: '',
      method_type: 'mobile_banking',
      account_name: '',
      account_number: '',
      payment_number: '',
      payment_instructions: '',
      icon_url: '',
    });
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.method_type) {
      toast({ title: "Name and type are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Persist logo into BOTH icon_url (admin) and additional_info.logo_url
      // so the Recharge / HelperDashboard / Local-Pay logo readers all find it.
      const payload = {
        name: formData.name,
        method_type: formData.method_type,
        account_name: formData.account_name || null,
        account_number: formData.account_number || null,
        payment_number: formData.payment_number || formData.account_number || null,
        payment_instructions: formData.payment_instructions || null,
        icon_url: formData.icon_url || null,
        additional_info: formData.icon_url ? { logo_url: formData.icon_url } : null,
        updated_at: new Date().toISOString(),
      };

      if (editingMethod) {
        const { error } = await supabase
          .from('topup_payment_methods')
          .update(payload)
          .eq('id', editingMethod.id);

        if (error) throw error;
        toast({ title: "Payment method updated ✅" });
      } else {
        const { error } = await supabase
          .from('topup_payment_methods')
          .insert({ ...payload, is_active: true, display_order: methods.length });

        if (error) throw error;
        toast({ title: "Payment method added ✅" });
      }

      setShowDialog(false);
      resetForm();
      await loadMethods();
    } catch (error: any) {
      console.error('[AdminPaymentMethods] Save error:', error);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      name: method.name || '',
      method_type: method.method_type || 'mobile_banking',
      account_name: method.account_name || '',
      account_number: method.account_number || '',
      payment_number: method.payment_number || '',
      payment_instructions: method.payment_instructions || '',
      icon_url: method.icon_url || '',
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment method?")) return;
    const { error } = await supabase.from('topup_payment_methods').delete().eq('id', id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted ✅" });
    loadMethods();
  };

  const handleToggleActive = async (method: PaymentMethod) => {
    const { error } = await supabase
      .from('topup_payment_methods')
      .update({ is_active: !method.is_active, updated_at: new Date().toISOString() })
      .eq('id', method.id);

    if (error) {
      toast({ title: "Toggle failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: method.is_active ? "Method deactivated" : "Method activated ✅" });
    loadMethods();
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= methods.length) return;

    const a = methods[index];
    const b = methods[targetIndex];

    await Promise.all([
      supabase.from('topup_payment_methods').update({ display_order: targetIndex }).eq('id', a.id),
      supabase.from('topup_payment_methods').update({ display_order: index }).eq('id', b.id),
    ]);
    loadMethods();
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please upload an image file (PNG / JPG / SVG / WebP)", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2 MB", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `topup-method-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `topup-payment-methods/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from('payment-logos')
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('payment-logos').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, icon_url: pub.publicUrl }));
      toast({ title: "Logo uploaded ✅" });
    } catch (err: any) {
      console.error('[AdminPaymentMethods] Logo upload error:', err);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const getMethodIcon = (type: string) => {
    switch (type) {
      case 'mobile_banking': return Smartphone;
      case 'bank': return CreditCard;
      case 'crypto':
      case 'binance': return Bitcoin;
      default: return Wallet;
    }
  };

  const getMethodColor = (type: string) => {
    switch (type) {
      case 'mobile_banking': return 'bg-pink-500/20 text-pink-400';
      case 'bank': return 'bg-blue-500/20 text-blue-400';
      case 'crypto':
      case 'binance': return 'bg-orange-500/20 text-orange-400';
      case 'epay': return 'bg-emerald-500/20 text-emerald-400';
      case 'upi': return 'bg-indigo-500/20 text-indigo-400';
      default: return 'bg-purple-500/20 text-purple-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Top-up Payment Methods</h1>
          <p className="text-slate-400">Manage payment methods for manual top-up & helper dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadMethods} className="border-slate-600">
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
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => handleReorder(index, 'up')} disabled={index === 0}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => handleReorder(index, 'down')} disabled={index === methods.length - 1}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden ${getMethodColor(method.method_type)}`}>
                      {method.icon_url ? (
                        <img
                          src={method.icon_url}
                          alt={method.name}
                          className="w-12 h-12 object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Icon className="w-6 h-6" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{method.name}</p>
                        <Badge className={getMethodColor(method.method_type)}>
                          {method.method_type?.replace('_', ' ')}
                        </Badge>
                        {!method.is_active && (
                          <Badge variant="outline" className="text-red-400 border-red-400">Inactive</Badge>
                        )}
                      </div>
                      {method.account_name && <p className="text-slate-400 text-sm">{method.account_name}</p>}
                      {(method.payment_number || method.account_number) && (
                        <p className="text-slate-500 text-xs font-mono">{method.payment_number || method.account_number}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleToggleActive(method)}
                        className={method.is_active ? 'text-green-400' : 'text-slate-400'}>
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
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
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
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., bKash, ePay, Binance Pay"
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
                    {METHOD_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-white">Account Name</Label>
              <Input
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                placeholder="Account holder name"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-white">Account Number / ID</Label>
              <Input
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                placeholder="Account number, bank account, etc."
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-white">Payment Number / Pay ID</Label>
              <Input
                value={formData.payment_number}
                onChange={(e) => setFormData({ ...formData, payment_number: e.target.value })}
                placeholder="Phone, email or Binance Pay ID shown to user"
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-white">Payment Instructions</Label>
              <Textarea
                value={formData.payment_instructions}
                onChange={(e) => setFormData({ ...formData, payment_instructions: e.target.value })}
                placeholder="Step-by-step instructions for the user..."
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-white">Logo Image</Label>
              <p className="text-xs text-slate-400 mb-2">Upload PNG / JPG / SVG / WebP (under 2 MB). Shown in user Recharge page & Helper Dashboard.</p>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {formData.icon_url ? (
                    <img src={formData.icon_url} alt="logo" className="w-16 h-16 object-cover" />
                  ) : (
                    <CreditCard className="w-7 h-7 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium cursor-pointer transition-colors w-fit">
                    <Upload className="w-4 h-4" />
                    {uploadingLogo ? 'Uploading...' : (formData.icon_url ? 'Replace Logo' : 'Upload Logo')}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingLogo}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {formData.icon_url && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, icon_url: '' })}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" /> Remove logo
                    </button>
                  )}
                </div>
              </div>
              <Input
                value={formData.icon_url}
                onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                placeholder="Or paste an image URL: https://..."
                className="bg-slate-800 border-slate-700 text-white mt-3 text-xs"
              />
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
