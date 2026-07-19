import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Crown, Eye, EyeOff, RefreshCw, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agencyId: string;
  agencyName: string;
  ownerUserId: string | null;
  defaultCountry?: string | null;
  onGranted?: () => void;
}

const COUNTRIES: { code: string; name: string }[] = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
  { code: "NP", name: "Nepal" },
  { code: "LK", name: "Sri Lanka" },
  { code: "EG", name: "Egypt" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "UAE" },
  { code: "TR", name: "Turkey" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
];

function generatePassword() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let out = "";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) out += charset[arr[i] % charset.length];
  return out;
}

export default function GrantCsaDialog({ open, onOpenChange, agencyId, agencyName, ownerUserId, defaultCountry, onGranted }: Props) {
  const [country, setCountry] = useState(defaultCountry?.toUpperCase() || "BD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [commission, setCommission] = useState("0");
  const [tenure, setTenure] = useState<"permanent" | "6m" | "1y" | "2y" | "custom">("permanent");
  const [customDate, setCustomDate] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState(false);
  const loginUrl = `${window.location.origin}/csa-login`;

  const computeExpiry = (): string | null => {
    if (tenure === "permanent") return null;
    if (tenure === "custom") return customDate ? new Date(customDate).toISOString() : null;
    const d = new Date();
    if (tenure === "6m") d.setMonth(d.getMonth() + 6);
    if (tenure === "1y") d.setFullYear(d.getFullYear() + 1);
    if (tenure === "2y") d.setFullYear(d.getFullYear() + 2);
    return d.toISOString();
  };
  const tenureLabelText = (): string => {
    if (tenure === "permanent") return "Permanent";
    if (tenure === "6m") return "6 Months";
    if (tenure === "1y") return "1 Year";
    if (tenure === "2y") return "2 Years";
    return "Custom";
  };

  const submit = async () => {
    if (!ownerUserId) {
      toast.error("Agency has no owner user — cannot grant");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      // 1. Create or update auth user with email+password
      const { data: created, error: fnErr } = await supabase.functions.invoke("admin-create-csa-user", {
        body: { email: email.trim().toLowerCase(), password },
      });
      if (fnErr || created?.error) {
        throw new Error(fnErr?.message || created?.error || "Failed to create login user");
      }
      const csaUserId = created.user_id as string;

      // 2. Grant CSA via RPC
      const expiresAt = computeExpiry();
      if (tenure === "custom" && !expiresAt) {
        throw new Error("Pick a custom expiry date");
      }
      const { error } = await supabase.rpc("admin_grant_country_super_admin", {
        _agency_id: agencyId,
        _user_id: csaUserId,
        _email: email.trim().toLowerCase(),
        _country_code: country,
        _commission_percent: Number(commission) || 0,
        _expires_at: expiresAt,
        _tenure_label: tenureLabelText(),
      } as any);
      if (error) throw error;

      toast.success(`${agencyName} is CSA for ${country} · ${tenureLabelText()}`);
      setGranted(true);
      onGranted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to grant CSA");
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(`Login URL: ${loginUrl}\nEmail: ${email}\nPassword: ${password}`);
    toast.success("Login info copied");
  };

  const closeAll = () => {
    setGranted(false);
    setEmail("");
    setPassword(generatePassword());
    onOpenChange(false);
  };

  const copyCreds = async () => {
    await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}\nLogin: ${loginUrl}`);
    toast.success("Credentials copied");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeAll(); else onOpenChange(v); }}>
      <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Crown className="w-5 h-5" />
            {granted ? "CSA Granted — Share Login" : "Grant Country Super Admin"}
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            {granted
              ? `Send the secret login link below privately to ${agencyName}'s owner. They will use the email + password to sign in.`
              : `${agencyName} will gain a country-scoped admin dashboard and permanent agency protection.`}
          </p>
        </DialogHeader>

        {granted ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
              <div>
                <p className="text-[10px] text-amber-300/70 uppercase tracking-wider">Secret Login URL</p>
                <p className="font-mono text-sm break-all text-amber-200">{loginUrl}</p>
              </div>
              <div>
                <p className="text-[10px] text-amber-300/70 uppercase tracking-wider">Email</p>
                <p className="font-mono text-sm break-all">{email}</p>
              </div>
              <div>
                <p className="text-[10px] text-amber-300/70 uppercase tracking-wider">Password</p>
                <p className="font-mono text-sm break-all">{password}</p>
              </div>
            </div>
            <Button onClick={copyAll} className="w-full bg-amber-500 text-black hover:bg-amber-400">
              <Copy className="w-4 h-4 mr-2" /> Copy all (URL + Email + Password)
            </Button>
            <p className="text-[10px] text-white/40 text-center">
              ⚠ This password will not be shown again. Save it now.
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-slate-600 text-xs">Country (locked after grant)</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white max-h-72">
                  {COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 text-xs">Login Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="csa.bd@example.com" className="bg-slate-800 border-slate-700" />
            </div>
            <div>
              <Label className="text-slate-600 text-xs">Login Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-800 border-slate-700 pr-9 font-mono text-sm" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon"
                  onClick={() => setPassword(generatePassword())}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={copyCreds}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-white/40 mt-1">Share these credentials privately with the owner.</p>
            </div>
            <div>
              <Label className="text-slate-600 text-xs">Commission % (optional)</Label>
              <Input type="number" step="0.1" min="0" max="100" value={commission}
                onChange={(e) => setCommission(e.target.value)} className="bg-slate-800 border-slate-700" />
            </div>
            <div>
              <Label className="text-slate-600 text-xs">Tenure / Validity</Label>
              <Select value={tenure} onValueChange={(v) => setTenure(v as any)}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="permanent">♾ Permanent (never expires)</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                  <SelectItem value="2y">2 Years</SelectItem>
                  <SelectItem value="custom">Custom date…</SelectItem>
                </SelectContent>
              </Select>
              {tenure === "custom" && (
                <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-800 border-slate-700 mt-2" min={new Date().toISOString().slice(0,10)} />
              )}
              <p className="text-[10px] text-white/40 mt-1">
                {tenure === "permanent"
                  ? "CSA power will not auto-expire. Owner can revoke any time."
                  : `Auto-revokes after tenure ends. Owner can extend/re-grant any time.`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {granted ? (
            <Button onClick={closeAll} className="w-full bg-emerald-600 hover:bg-emerald-500">Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeAll} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}
                className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold hover:from-amber-400 hover:to-yellow-500">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
                Grant CSA Power
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
