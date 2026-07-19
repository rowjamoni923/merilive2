import { useState } from "react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type CheckResult = {
  serviceAccount?: { ok: boolean; clientEmail?: string; projectId?: string; error?: string };
  oauthToken?: { ok: boolean; tokenPrefix?: string; error?: string };
  googlePlayApi?: { ok: boolean; status?: number; bodyPreview?: string };
  products?: { ok: boolean; total: number; items: Array<{ productId: string; priceUsd: number; resolved: boolean; coins?: number; error?: string }> };
  recentActivity?: { totalGooglePlayRecharges: number; lastFive: Array<{ id: string; user_id: string; google_product_id: string; diamonds_received: number; status: string; created_at: string }> };
};

export default function AdminGooglePlayHealth() {
  useEffect(() => { document.title = "Google Play Health — Admin"; }, []);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ success: boolean; result: { checks: CheckResult; timestamp?: string; packageName?: string; error?: string } } | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("google-play-health", { body: {} });
      if (error) throw error;
      setData(resp);
      toast.success(resp.success ? "All checks passed" : "Some checks failed — review below");
    } catch (e: any) {
      toast.error(e?.message || "Health check failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        {ok === undefined ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {detail && <span className="text-xs text-muted-foreground text-right max-w-[60%] break-all">{detail}</span>}
    </div>
  );

  const r = data?.result?.checks;
  const meta = data?.result;

  return (
    <div className="admin-pro-shell container mx-auto p-4 max-w-4xl space-y-4">
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Google Play Billing Health</h1>
        <Button onClick={run} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run Check
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Verifies the full chain: service account JSON → OAuth2 token mint → Google Play Developer API reachability → diamond_packages product resolution → recent recharge activity.
      </p>

      {!data && !loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Click "Run Check" to start.</CardContent></Card>
      )}

      {r && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Chain Status</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <Row label="Service Account JSON" ok={r.serviceAccount?.ok} detail={r.serviceAccount?.error || r.serviceAccount?.clientEmail} />
              <Row label="OAuth2 Access Token" ok={r.oauthToken?.ok} detail={r.oauthToken?.error || r.oauthToken?.tokenPrefix} />
              <Row label="Google Play API Reachable" ok={r.googlePlayApi?.ok} detail={`HTTP ${r.googlePlayApi?.status ?? "?"}`} />
              <Row label="Product Catalog Resolves" ok={r.products?.ok} detail={`${r.products?.items.filter(i => i.resolved).length}/${r.products?.total} resolved`} />
              {meta?.packageName && <Row label="Package" ok={true} detail={meta.packageName} />}
            </CardContent>
          </Card>

          {r.products && (
            <Card>
              <CardHeader><CardTitle className="text-base">Products ({r.products.total})</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {r.products.items.map((p) => (
                  <div key={p.productId} className="flex items-center justify-between py-1 text-sm border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      {p.resolved ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                      <span className="font-mono text-xs">{p.productId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>${p.priceUsd}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.diamonds?.toLocaleString() ?? "?"} 💎</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {r.recentActivity && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Recent Google Play Recharges
                  <Badge variant="outline">{r.recentActivity.totalGooglePlayRecharges} total</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {r.recentActivity.lastFive.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Google Play recharges recorded yet. Make a real test purchase from the Android APK to populate this list.</p>
                ) : (
                  <div className="space-y-2">
                    {r.recentActivity.lastFive.map((t) => (
                      <div key={t.id} className="text-xs border border-border rounded p-2 space-y-1">
                        <div className="flex justify-between"><span className="font-mono">{t.google_product_id}</span><Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge></div>
                        <div className="text-muted-foreground">User: <span className="font-mono">{t.user_id.slice(0, 8)}…</span> · +{t.diamonds_received?.toLocaleString()} 💎 · {new Date(t.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {r.googlePlayApi?.bodyPreview && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Google API Probe Body</CardTitle></CardHeader>
              <CardContent><pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto">{r.googlePlayApi.bodyPreview}</pre></CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
