import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const COUNTRIES = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
  { code: "MM", name: "Myanmar" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
];

export default function SuperAdminApply() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [form, setForm] = useState({
    country_code: "BD",
    full_name: "",
    business_name: "",
    official_email: "",
    official_phone: "",
    whatsapp: "",
    telegram: "",
    national_id_url: "",
    business_doc_url: "",
    signed_contract_url: "",
    deposit_amount_usd: 10000,
    deposit_proof_url: "",
    deposit_tx_ref: "",
    requested_commission_percent: 25,
    notes: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth?next=/super-admin/apply"); return; }
      setUserId(user.id);
      const [s, e] = await Promise.all([
        supabase.from("country_super_admin_settings").select("*").limit(1).maybeSingle(),
        supabase.from("country_super_admin_applications").select("*").eq("applicant_user_id", user.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      ]);
      if (s.data) setSettings(s.data);
      if (e.data) setExisting(e.data);
    })();
  }, [navigate]);

  const upload = async (file: File, key: keyof typeof form) => {
    if (!userId) return;
    const path = `super-admin/${userId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("uploads").getPublicUrl(path);
    setForm(f => ({ ...f, [key]: data.publicUrl }));
    toast.success("Uploaded");
  };

  const submit = async () => {
    if (!userId) return;
    if (!form.full_name || !form.official_email || !form.official_phone) {
      return toast.error("Full name, official email & phone are required");
    }
    if (!form.signed_contract_url) {
      return toast.error("Signed contract upload is mandatory");
    }
    if (form.deposit_amount_usd < (settings?.min_deposit_usd || 10000)) {
      return toast.error(`Minimum deposit is $${settings?.min_deposit_usd || 10000}`);
    }
    if (form.requested_commission_percent > 25) {
      return toast.error("Commission cannot exceed 25%");
    }
    setLoading(true);
    const { error } = await supabase.from("country_super_admin_applications").insert({
      ...form,
      applicant_user_id: userId,
      status: "pending",
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Application submitted. Our team will officially contact you.");
    navigate("/");
  };

  if (existing && existing.status !== "rejected" && existing.status !== "withdrawn") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" /> Application status: {existing.status}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>Country: <b>{existing.country_code}</b></div>
            <div>Submitted: {new Date(existing.created_at).toLocaleString()}</div>
            <div>Deposit: ${Number(existing.deposit_amount_usd).toLocaleString()}</div>
            <p className="text-muted-foreground pt-2">
              Our team will officially contact you at <b>{existing.official_email}</b> /{" "}
              <b>{existing.official_phone}</b> for verification.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Become a Country Super Admin
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage withdrawals for your country. Minimum <b>${settings?.min_deposit_usd?.toLocaleString() || "10,000"}</b> deposit + signed contract required.
            You earn up to <b>25%</b> commission on every completed withdrawal in your country.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Country</Label>
            <select className="w-full h-10 px-3 rounded border bg-background"
              value={form.country_code}
              onChange={(e) => setForm({ ...form, country_code: e.target.value })}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Full legal name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Business name</Label>
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </div>
            <div>
              <Label>Official email *</Label>
              <Input type="email" value={form.official_email} onChange={(e) => setForm({ ...form, official_email: e.target.value })} />
            </div>
            <div>
              <Label>Official phone *</Label>
              <Input value={form.official_phone} onChange={(e) => setForm({ ...form, official_phone: e.target.value })} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div>
              <Label>Telegram</Label>
              <Input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>National ID (upload)</Label>
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "national_id_url")} />
            {form.national_id_url && <a className="text-xs text-primary underline" href={form.national_id_url} target="_blank" rel="noreferrer">Uploaded ✓</a>}
          </div>
          <div className="space-y-2">
            <Label>Business document (upload)</Label>
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "business_doc_url")} />
            {form.business_doc_url && <a className="text-xs text-primary underline" href={form.business_doc_url} target="_blank" rel="noreferrer">Uploaded ✓</a>}
          </div>
          <div className="space-y-2">
            <Label>Signed contract (REQUIRED) *</Label>
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "signed_contract_url")} />
            {form.signed_contract_url && <a className="text-xs text-primary underline" href={form.signed_contract_url} target="_blank" rel="noreferrer">Uploaded ✓</a>}
          </div>

          <div className="border-t pt-3 grid grid-cols-2 gap-3">
            <div>
              <Label>Deposit amount (USD) *</Label>
              <Input type="number" min={settings?.min_deposit_usd || 10000} value={form.deposit_amount_usd}
                onChange={(e) => setForm({ ...form, deposit_amount_usd: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Deposit transaction ref</Label>
              <Input value={form.deposit_tx_ref} onChange={(e) => setForm({ ...form, deposit_tx_ref: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Deposit proof (screenshot)</Label>
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "deposit_proof_url")} />
            {form.deposit_proof_url && <a className="text-xs text-primary underline" href={form.deposit_proof_url} target="_blank" rel="noreferrer">Uploaded ✓</a>}
          </div>

          <div>
            <Label>Requested commission % (max 25)</Label>
            <Input type="number" max={25} min={0} value={form.requested_commission_percent}
              onChange={(e) => setForm({ ...form, requested_commission_percent: Math.min(25, Number(e.target.value)) })} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
            Submit application
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Our team will officially contact you to verify the deposit and finalize the contract before activation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
