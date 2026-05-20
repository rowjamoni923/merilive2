import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  helperId: string;
  helperCountryCode?: string | null;
  onSaved?: () => void;
}

interface Row {
  id: string;
  country_code: string;
  method_name: string;
  account_name: string | null;
  account_number: string | null;
  logo_url: string | null;
  instructions: string | null;
}

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "NP", name: "Nepal" },
  { code: "LK", name: "Sri Lanka" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "EG", name: "Egypt" },
  { code: "NG", name: "Nigeria" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
];

/**
 * Reusable manage dialog for Level 1–4 helpers to add / list / delete their
 * own custom local payment methods (e.g. bKash, Nagad, Easypaisa, UPI, GCash).
 * Writes to `helper_country_payment_methods` with method_type='manual_local',
 * same table the Recharge page + HelperPaymentMethodsCard read from.
 */
export default function AddLocalPaymentMethodDialog({
  open,
  onOpenChange,
  helperId,
  helperCountryCode,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [country, setCountry] = useState<string>(helperCountryCode || "BD");
  const [methodName, setMethodName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [instructions, setInstructions] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const load = async () => {
    if (!helperId) return;
    setLoading(true);
    const { data } = await supabase
      .from("helper_country_payment_methods")
      .select("id, country_code, method_name, account_name, account_number, logo_url, instructions")
      .eq("helper_id", helperId)
      .eq("is_active", true)
      .order("country_code", { ascending: true });
    setRows((data || []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      load();
      setCountry(helperCountryCode || "BD");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, helperId]);

  const reset = () => {
    setMethodName("");
    setAccountName("");
    setAccountNumber("");
    setInstructions("");
    setLogoFile(null);
  };

  const handleAdd = async () => {
    if (!country || !methodName.trim() || !accountNumber.trim()) {
      toast({
        title: "Missing fields",
        description: "Country, method name and account number are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      let logoUrl: string | null = null;
      if (logoFile) {
        setUploadingLogo(true);
        const ext = logoFile.name.split(".").pop() || "png";
        const fileName = `helper-${helperId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-logos")
          .upload(fileName, logoFile, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("payment-logos").getPublicUrl(fileName);
        logoUrl = pub.publicUrl;
        setUploadingLogo(false);
      }

      const countryName = COUNTRIES.find((c) => c.code === country)?.name || country;
      const { error } = await supabase.from("helper_country_payment_methods").insert({
        helper_id: helperId,
        country_code: country,
        country_name: countryName,
        payment_method_name: methodName.trim(),
        method_name: methodName.trim(),
        method_type: "manual_local",
        account_name: accountName.trim() || null,
        account_number: accountNumber.trim(),
        instructions: instructions.trim() || null,
        logo_url: logoUrl,
        additional_info: { is_merchant: false },
      });
      if (error) throw error;

      toast({ title: "Added", description: `${methodName} added for ${countryName}` });
      reset();
      await load();
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to add", variant: "destructive" });
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("helper_country_payment_methods")
        .update({ is_active: false })
        .eq("id", id)
        .eq("helper_id", helperId);
      if (error) throw error;
      toast({ title: "Removed" });
      await load();
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-amber-900">Manage Payment Methods</DialogTitle>
          <p className="text-xs text-slate-600">
            Add the local payment methods you accept. Users will see them when they recharge through you. You
            can add as many as you want.
          </p>
        </DialogHeader>

        <div className="space-y-2 border-b pb-3">
          <p className="text-xs font-bold text-slate-700">Your methods ({rows.length})</p>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
          ) : rows.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">None yet. Add your first below.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200"
                >
                  {r.logo_url ? (
                    <img src={r.logo_url} alt={r.method_name} className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-amber-400 text-white grid place-items-center text-xs font-bold">
                      {r.method_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {r.method_name} <span className="text-[10px] text-slate-500">· {r.country_code}</span>
                    </p>
                    <p className="text-[10px] text-slate-600 truncate">{r.account_number}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                    onClick={() => handleDelete(r.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-amber-800">Add a new method</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="text-xs">
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Method name *</Label>
              <Input
                value={methodName}
                onChange={(e) => setMethodName(e.target.value)}
                placeholder="bKash / UPI / GCash"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Account name</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Optional"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Account number *</Label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Instructions (optional)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Send Money only, do not Cash Out"
              className="text-xs min-h-[60px]"
            />
          </div>
          <div>
            <Label className="text-[11px]">Logo (optional, PNG/JPG)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="h-9 text-xs"
              />
              {uploadingLogo && <Loader2 className="w-4 h-4 animate-spin text-amber-600" />}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">
            Close
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
            Add Method
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
