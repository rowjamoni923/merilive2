import { useEffect, useState, useCallback } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Ban, Loader2, Building2, User, RotateCcw, Shield } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CopyableUid } from "@/components/admin/CopyableUid";

interface ClosedAgency {
  id: string;
  name: string;
  agency_code: string;
  owner_id: string | null;
  owner_display_name: string | null;
  owner_app_uid: string | null;
  owner_avatar_url: string | null;
  created_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  activation_deadline: string | null;
  active_host_count: number | null;
}

export default function ClosedAgenciesTab() {
  const [items, setItems] = useState<ClosedAgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const reactivate = useCallback(async (id: string, name: string) => {
    if (!confirm(`Reactivate "${name}"? Owner gets a fresh 30-day window to activate 10 hosts.`)) return;
    setReactivatingId(id);
    try {
      const { error } = await supabase.rpc("admin_reactivate_agency", { _agency_id: id });
      if (error) throw error;
      toast.success(`${name} reactivated`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Failed to reactivate");
    } finally {
      setReactivatingId(null);
    }
  }, []);

  const load = useCallback(async (q: string = "") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_search_closed_agencies", {
        _search: q || null,
      });
      if (error) throw error;
      setItems((data as ClosedAgency[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load closed agencies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search by UID, owner name, agency name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(search.trim())}
                className="pl-10 bg-white/5 border-white/10 text-white"
              />
            </div>
            <Button
              onClick={() => load(search.trim())}
              disabled={loading}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              Search
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSearch(""); load(""); }}
              className="bg-white/5 border-white/10 text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-white/50 mt-3">
            Agencies that were auto-closed for failing to activate 10 hosts within 30 days. Official agencies are exempt and never appear here.
          </p>
        </CardContent>
      </Card>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="flex flex-col items-center justify-center h-48 text-white/50 gap-2">
            <Ban className="w-10 h-10 text-white/30" />
            <p>No closed agencies found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((a) => (
            <Card key={a.id} className="bg-slate-800/60 border-rose-500/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{a.name}</p>
                      <p className="text-xs text-white/50">Code: {a.agency_code}</p>
                    </div>
                  </div>
                  <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">Closed</Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-white/70">
                  <User className="w-3.5 h-3.5 text-white/50" />
                  <span className="truncate">{a.owner_display_name || "Unknown owner"}</span>
                  {a.owner_app_uid && (
                    <span className="ml-auto">
                      <CopyableUid value={a.owner_app_uid} />
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded p-2">
                    <p className="text-white/40">Active hosts</p>
                    <p className="text-white font-medium">{a.active_host_count ?? 0} / 10</p>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <p className="text-white/40">Closed at</p>
                    <p className="text-white font-medium">
                      {a.closed_at ? format(new Date(a.closed_at), "dd MMM yyyy HH:mm") : "—"}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded p-2 col-span-2">
                    <p className="text-white/40">Created</p>
                    <p className="text-white font-medium">
                      {a.created_at ? format(new Date(a.created_at), "dd MMM yyyy") : "—"}
                      {a.activation_deadline && (
                        <span className="text-white/50">
                          {" · Deadline "}
                          {format(new Date(a.activation_deadline), "dd MMM yyyy")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="bg-rose-500/10 border border-rose-500/30 rounded p-2">
                  <p className="text-rose-300 text-xs font-medium mb-0.5">Closure reason</p>
                  <p className="text-white/80 text-xs">
                    {a.closed_reason || "Failed to activate 10 hosts within 30 days."}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => reactivate(a.id, a.name)}
                  disabled={reactivatingId === a.id}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {reactivatingId === a.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Reactivate Agency
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
