import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Crown, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function CsaLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error("Login failed");

      // Verify CSA role
      const { data: ctx } = await supabase.rpc("csa_get_my_context");
      if (!ctx) {
        await supabase.auth.signOut();
        throw new Error("You are not a Country Super Admin");
      }
      toast.success("Welcome back");
      navigate("/country-admin", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-pro-shell min-h-screen flex items-center justify-center p-4 bg-white">
      <Card className="w-full max-w-md p-8 bg-slate-900/80 border-amber-500/30 backdrop-blur-xl shadow-[0_0_60px_rgba(245,158,11,0.15)]">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg ring-2 ring-amber-300/40 mb-3">
            <Crown className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent">
            Country Super Admin
          </h1>
          <p className="text-xs text-white/50 mt-1">Restricted access · Premium dashboard</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-white/80 text-xs">Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white" />
          </div>
          <div>
            <Label className="text-white/80 text-xs">Password</Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white pr-9" />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={busy}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold hover:from-amber-400 hover:to-yellow-500">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
