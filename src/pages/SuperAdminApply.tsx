import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ScrollText, IdCard, PenLine, ArrowLeft, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { AGREEMENT_VERSION, buildAgreementText } from "@/lib/superAdminAgreement";
import { generateAgreementPdf } from "@/lib/generateAgreementPdf";

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
const BUCKET = "super-admin-agreements";

export default function SuperAdminApply() {
  const navigate = useNavigate();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [existing, setExisting] = useState<any>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [form, setForm] = useState({
    country_code: "BD",
    full_name: "",
    business_name: "",
    full_address: "",
    official_email: "",
    official_phone: "",
    whatsapp: "",
    telegram: "",
    nid_country: "BD",
    nid_number: "",
    nid_front_url: "",
    nid_back_url: "",
    business_doc_url: "",
    notes: "",
  });


  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth?next=/super-admin/apply"); return; }
      setUserId(user.id);
      const [s, e] = await Promise.all([
        supabase.from("country_super_admin_settings").select("*").limit(1).maybeSingle(),
        supabase.from("country_super_admin_applications").select("*").eq("applicant_user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (s.data) setSettings(s.data);
      if (e.data) setExisting(e.data);
    })();
  }, [navigate]);

  const upload = async (file: File, key: keyof typeof form) => {
    if (!userId) return;
    const path = `${userId}/${key}-${Date.now()}-${file.name.replace(/[^\w.-]/g,"_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
    setForm(f => ({ ...f, [key]: signed?.signedUrl || path }));
    toast.success("Uploaded");
  };

  const MIN_DEPOSIT = settings?.min_deposit_usd || 10000;

  const submit = async () => {
    if (!userId) return;
    if (!form.full_name || !form.full_address || !form.official_email || !form.official_phone) {
      return toast.error("Full name, address, email and phone are required");
    }
    if (!form.nid_number || !form.nid_front_url) {
      return toast.error("National ID number + front image are required");
    }
    if (!acceptTerms) return toast.error("You must accept the agreement");
    if (sigRef.current?.isEmpty()) return toast.error("Please sign the agreement");

    setLoading(true);
    try {
      const signature_data_url = sigRef.current!.toDataURL();
      const now = new Date().toISOString();

      const pdfBlob = await generateAgreementPdf({
        deposit_amount_usd: MIN_DEPOSIT,
        commission_percent: 25,
        date_iso: now,
      }, signature_data_url);

      const pdfPath = `${userId}/agreement-${Date.now()}.pdf`;
      const up = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBlob, {
        upsert: true, contentType: "application/pdf",
      });
      if (up.error) throw up.error;
      const signedPdf = await supabase.storage.from(BUCKET).createSignedUrl(pdfPath, 60 * 60 * 24 * 365);

      const { error } = await supabase.from("country_super_admin_applications").insert({
        applicant_user_id: userId,
        // Helper does NOT set deposit — admin confirms the actual amount at approval time.
        requested_commission_percent: 25,
        signature_data_url,
        agreement_version: AGREEMENT_VERSION,
        agreement_signed_at: now,
        agreement_pdf_url: signedPdf.data?.signedUrl || pdfPath,
        status: "pending",
      });
      if (error) throw error;
      toast.success(
        `Application submitted. Our team will contact you at ${form.official_email} within 24–48 hours.`
      );
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };


  if (existing && existing.status !== "rejected" && existing.status !== "withdrawn") {
    return (
      <div className="admin-pro-shell min-h-screen p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" /> Application status: {existing.status}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>Country: <b>{existing.country_code}</b> · Tier: <Badge>Level 6 / Contract</Badge></div>
            <div>Submitted: {new Date(existing.created_at).toLocaleString()}</div>
            <div>Deposit: ${Number(existing.deposit_amount_usd).toLocaleString()}</div>
            {existing.agreement_pdf_url && (
              <a className="text-primary underline text-sm" href={existing.agreement_pdf_url} target="_blank" rel="noreferrer">
                📄 View signed agreement
              </a>
            )}
            <p className="text-muted-foreground pt-2">
              Our team will officially contact you at <b>{existing.official_email}</b> /{" "}
              <b>{existing.official_phone}</b> for A-to-Z verification.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agreementVars = {
  };

  return (
    <div className="admin-pro-shell min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      {/* Sticky back header */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/95 backdrop-blur border-b flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-9">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="text-sm font-semibold">Country Super Admin Application</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Country Super Admin — Level 6 (Contract Tier)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage withdrawals for your country. Sits above Levels 1–5 helpers.
            Earn up to <b>25%</b> commission on every completed withdrawal.
          </p>
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Mail className="w-3.5 h-3.5" /> How onboarding works
            </div>
            <p className="text-foreground/80 leading-relaxed">
              <b>Step 1 — Submit this application.</b> Provide identity, contact and signed agreement.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              <b>Step 2 — Our admin team contacts you</b> at your official email within 24–48 hours
              to coordinate the <b>${MIN_DEPOSIT.toLocaleString()} deposit</b>, verify documents, and complete onboarding.
              Once approved, you'll receive a private access link giving you full Country Super Admin access for your country.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Operation country</Label>
              <select className="w-full h-10 px-3 rounded border bg-background"
                value={form.country_code}
                onChange={(e) => setForm({ ...form, country_code: e.target.value, nid_country: e.target.value })}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div>
              <Label>Full legal name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Business / trade name</Label>
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Full residential address *</Label>
              <Textarea value={form.full_address} rows={2}
                onChange={(e) => setForm({ ...form, full_address: e.target.value })} />
            </div>
            <div>
              <Label>Official email *</Label>
              <Input type="email" value={form.official_email} onChange={(e) => setForm({ ...form, official_email: e.target.value })} />
            </div>
            <div>
              <Label>Official mobile *</Label>
              <Input value={form.official_phone} onChange={(e) => setForm({ ...form, official_phone: e.target.value })} />
            </div>
            <div>
              <Label>WhatsApp number</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div>
              <Label>Telegram</Label>
              <Input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 font-medium"><IdCard className="w-4 h-4" /> National ID verification</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>NID country</Label>
                <select className="w-full h-10 px-3 rounded border bg-background"
                  value={form.nid_country}
                  onChange={(e) => setForm({ ...form, nid_country: e.target.value })}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>NID / National ID number *</Label>
                <Input value={form.nid_number} onChange={(e) => setForm({ ...form, nid_number: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>NID front image *</Label>
              <Input type="file" accept="image/*"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "nid_front_url")} />
              {form.nid_front_url && <span className="text-xs text-primary">Uploaded ✓</span>}
            </div>
            <div>
              <Label>NID back image</Label>
              <Input type="file" accept="image/*"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "nid_back_url")} />
              {form.nid_back_url && <span className="text-xs text-primary">Uploaded ✓</span>}
            </div>
            <div>
              <Label>Business document (optional)</Label>
              <Input type="file" accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "business_doc_url")} />
              {form.business_doc_url && <span className="text-xs text-primary">Uploaded ✓</span>}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label>Notes for the admin team (optional)</Label>
            <Textarea
              value={form.notes}
              rows={3}
              placeholder="Anything else our team should know — preferred contact time, time zone, language, etc."
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 font-medium"><ScrollText className="w-4 h-4" /> Agreement (read carefully)</div>
            <div className="max-h-72 overflow-y-auto border rounded p-3 bg-muted/30 text-xs whitespace-pre-wrap font-mono">
              {buildAgreementText(agreementVars).join("\n")}
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="accept" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
              <Label htmlFor="accept" className="text-sm leading-snug">
                I confirm every detail above is 100% real and accept the entire agreement.
                I understand false documents lead to deposit forfeiture and legal action.
              </Label>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><PenLine className="w-4 h-4" /> Your signature *</div>
              <SignaturePad ref={sigRef} />
            </div>
          </div>

          <Button onClick={submit} disabled={loading || !acceptTerms} className="w-full">
            {loading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
            Sign & submit application
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            On submit, a signed PDF agreement is generated. Our admin team will contact you at your official
            email to coordinate the ${MIN_DEPOSIT.toLocaleString()} deposit and complete onboarding.
          </p>
        </CardContent>
      </Card>
    </div>
  );

}
