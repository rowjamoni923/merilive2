import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, User, Building2, Receipt, Wallet } from "lucide-react";

type UserHit = {
  id: string; username: string | null; display_name: string | null;
  email: string | null; phone_number: string | null;
  beans: number | null; diamonds: number | null; coins: number | null; created_at: string;
};
type AgencyHit = { id: string; name: string; agency_code: string | null; owner_id: string };
type LedgerHit = {
  id: number; user_id: string; currency: string; delta: number;
  source_type: string; payment_reference: string | null; created_at: string;
};

export default function AdminGlobalSearch() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [agencies, setAgencies] = useState<AgencyHit[]>([]);
  const [ledger, setLedger] = useState<LedgerHit[]>([]);

  const run = useCallback(async () => {
    const s = q.trim();
    if (!s) return;
    setLoading(true);
    const like = `%${s}%`;
    const isUuid = /^[0-9a-f-]{20,}$/i.test(s);

    const userQ = supabase
      .from("profiles")
      .select("id,username,display_name,email,phone_number,beans,diamonds,coins,created_at")
      .or(
        [
          isUuid ? `id.eq.${s}` : null,
          `username.ilike.${like}`,
          `display_name.ilike.${like}`,
          `email.ilike.${like}`,
          `phone_number.ilike.${like}`,
        ].filter(Boolean).join(",")
      )
      .limit(30);

    const agencyQ = supabase
      .from("agencies")
      .select("id,name,agency_code,owner_id")
      .or(`name.ilike.${like},agency_code.ilike.${like}${isUuid ? `,id.eq.${s},owner_id.eq.${s}` : ""}`)
      .limit(20);

    const ledgerQ = supabase
      .from("wallet_ledger_audit" as any)
      .select("id,user_id,currency,delta,source_type,payment_reference,created_at")
      .or(`payment_reference.ilike.${like},source_id.ilike.${like}${isUuid ? `,user_id.eq.${s}` : ""}`)
      .order("created_at", { ascending: false })
      .limit(30);

    const [u, a, l] = await Promise.all([userQ, agencyQ, ledgerQ]);
    setUsers((u.data as any) ?? []);
    setAgencies((a.data as any) ?? []);
    setLedger(((l.data as any) ?? []) as LedgerHit[]);
    setLoading(false);
  }, [q]);

  return (
    <div className="admin-pro-shell p-6 space-y-6 bg-white min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Search className="w-6 h-6 text-blue-600" /> Global Admin Search
        </h1>
        <p className="text-sm text-slate-500">User ID · username · email · phone · agency name/code · transaction reference · payment reference</p>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-4 flex gap-2">
          <Input
            placeholder="Search anything…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()}
            className="text-base"
            autoFocus
          />
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2">Search</span>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-slate-900 flex items-center gap-2"><User className="w-5 h-5" /> Users ({users.length})</CardTitle></CardHeader>
        <CardContent>
          {users.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Username</th><th>Email</th><th>Phone</th><th>Beans</th><th>Diamonds</th><th>Coins</th><th>Joined</th><th></th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 font-medium">{u.username || u.display_name || "—"}</td>
                    <td className="text-slate-500">{u.email || "—"}</td>
                    <td className="text-slate-500">{u.phone_number || "—"}</td>
                    <td>{Number(u.beans ?? 0).toLocaleString()}</td>
                    <td>{Number(u.diamonds ?? 0).toLocaleString()}</td>
                    <td>{Number(u.coins ?? 0).toLocaleString()}</td>
                    <td className="text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <Link to={`/admin/users/${u.id}/wallet`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                        <Wallet className="w-3 h-3" /> Wallet
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5" /> Agencies ({agencies.length})</CardTitle></CardHeader>
        <CardContent>
          {agencies.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Name</th><th>Code</th><th>Owner</th></tr>
              </thead>
              <tbody>
                {agencies.map(a => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{a.name}</td>
                    <td className="font-mono">{a.agency_code || "—"}</td>
                    <td>
                      <Link to={`/admin/users/${a.owner_id}/wallet`} className="text-blue-600 hover:underline font-mono">
                        {a.owner_id.slice(0, 10)}…
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-slate-900 flex items-center gap-2"><Receipt className="w-5 h-5" /> Ledger entries ({ledger.length})</CardTitle></CardHeader>
        <CardContent>
          {ledger.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Time</th><th>User</th><th>Currency</th><th>Δ</th><th>Source</th><th>Reference</th></tr>
              </thead>
              <tbody>
                {ledger.map(r => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td>
                      <Link to={`/admin/users/${r.user_id}/wallet`} className="text-blue-600 hover:underline font-mono">
                        {r.user_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="capitalize">{r.currency}</td>
                    <td className={r.delta >= 0 ? "text-emerald-700" : "text-rose-700"}>
                      {r.delta >= 0 ? "+" : ""}{Number(r.delta).toLocaleString()}
                    </td>
                    <td><Badge variant="outline" className="text-[10px]">{r.source_type}</Badge></td>
                    <td className="font-mono text-slate-500 max-w-[220px] truncate" title={r.payment_reference || ""}>{r.payment_reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty() {
  return <div className="text-center py-6 text-slate-400 text-sm">No matches</div>;
}
