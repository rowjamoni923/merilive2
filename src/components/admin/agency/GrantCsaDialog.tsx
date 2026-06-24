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
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState(false);
  const loginUrl = `${window.location.origin}/csa-login`;

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
      const { error } = await supabase.rpc("admin_grant_country_super_admin", {
        _agency_id: agencyId,
        _user_id: csaUserId,
        _email: email.trim().toLowerCase(),
        _country_code: country,
        _commission_percent: Number(commission) || 0,
      });
      if (error) throw error;

      toast.success(`${agencyName} is now Country Super Admin for ${country}`);
      onGranted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to grant CSA");
    } finally {
      setBusy(false);
    }
  };

  const copyCreds = async () => {
    await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}\nLogin: ${window.location.origin}/csa-login`);
    toast.success("Credentials copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-amber-500/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Crown className="w-5 h-5" />
            Grant Country Super Admin
          </DialogTitle>
          <p className="text-xs text-white/60 mt-1">
            {agencyName} will gain a country-scoped admin dashboard and permanent agency protection.
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-white/80 text-xs">Country (locked after grant)</Label>
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
            <Label className="text-white/80 text-xs">Login Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="csa.bd@example.com"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div>
            <Label className="text-white/80 text-xs">Login Password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-800 border-slate-700 pr-9 font-mono text-sm"
                />
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
            <Label className="text-white/80 text-xs">Commission % (optional)</Label>
            <Input
              type="number" step="0.1" min="0" max="100"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}
            className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold hover:from-amber-400 hover:to-yellow-500">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
            Grant CSA Power
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
