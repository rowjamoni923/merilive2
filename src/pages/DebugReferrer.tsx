/**
 * Pkg65 — Developer/debug screen for install referrer state.
 *
 * Shows the raw Play Store install-referrer string, parsed keys
 * (ref / agencyCode), and the current state of the localStorage
 * keys that drive invitation + agency auto-fill. Lets the user
 * re-trigger parsing, copy raw, and clear keys for re-testing.
 *
 * Route: /debug/referrer
 */
import { useCallback, useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { ArrowLeft, RefreshCw, Trash2, Copy, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { processInstallReferrer } from "@/utils/installReferrer";
import { parseReferralPayload } from "@/utils/referralParsing";

interface InstallReferrerPlugin {
  getReferrer(): Promise<{ referrer: string; cached: boolean; responseCode?: number }>;
}
const Native = registerPlugin<InstallReferrerPlugin>("InstallReferrer");

const LS_KEYS = [
  "meri_pending_invitation_ref",
  "meri_pending_referral",
  "meri_install_referrer_processed",
] as const;

interface NativeResult {
  referrer: string;
  cached: boolean;
  responseCode?: number;
  error?: string;
}

interface Parsed {
  ref: string | null;
  agencyCode: string | null;
  allParams: Array<[string, string]>;
  decoded: string;
}

function parse(raw: string): Parsed {
  const result = parseReferralPayload(raw);
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep raw */ }
  return {
    ref: result.ref,
    agencyCode: result.agencyCode,
    allParams: Object.entries(result.all),
    decoded,
  };
}

export default function DebugReferrer() {
  const navigate = useNavigate();
  const [native, setNative] = useState<NativeResult | null>(null);
  const [storage, setStorage] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const refreshStorage = useCallback(() => {
    const snap: Record<string, string | null> = {};
    for (const k of LS_KEYS) snap[k] = localStorage.getItem(k);
    setStorage(snap);
  }, []);

  const fetchNative = useCallback(async () => {
    setLoading(true);
    try {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
        setNative({ referrer: "", cached: false, error: "Not running on native Android" });
      } else {
        const r = await Native.getReferrer();
        setNative({ referrer: r?.referrer ?? "", cached: !!r?.cached, responseCode: r?.responseCode });
      }
    } catch (e: any) {
      setNative({ referrer: "", cached: false, error: e?.message || String(e) });
    } finally {
      setLoading(false);
      refreshStorage();
    }
  }, [refreshStorage]);

  useEffect(() => {
    fetchNative();
    refreshStorage();
  }, [fetchNative, refreshStorage]);

  const reprocess = async () => {
    localStorage.removeItem("meri_install_referrer_processed");
    await processInstallReferrer();
    await fetchNative();
    toast.success("Re-processed install referrer");
  };

  const clearKey = (k: string) => {
    localStorage.removeItem(k);
    refreshStorage();
    toast.success(`Cleared ${k}`);
  };

  const clearAll = () => {
    for (const k of LS_KEYS) localStorage.removeItem(k);
    refreshStorage();
    toast.success("Cleared all referrer keys");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const raw = native?.referrer ?? "";
  const parsed = parse(raw);
  const refConsumed = !!storage["meri_pending_invitation_ref"] === false && !!parsed.ref;
  const agencyConsumed = !!storage["meri_pending_referral"] === false && !!parsed.agencyCode;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Debug · Install Referrer</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Platform</h2>
            <Badge variant={Capacitor.isNativePlatform() ? "default" : "secondary"}>
              {Capacitor.getPlatform()}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Install Referrer API only returns data on a real Play Store install. Web preview and side-loaded
            APKs will show an empty referrer.
          </p>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Native plugin response
            </h2>
            <Button size="sm" variant="outline" onClick={fetchNative} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {native?.error ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{native.error}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="Raw" value={raw || "(empty)"} mono onCopy={raw ? () => copy(raw) : undefined} />
              <Row label="Decoded" value={parsed.decoded || "(empty)"} mono />
              <Row label="Cached" value={native?.cached ? "yes" : "no"} />
              {native?.responseCode !== undefined && (
                <Row label="Response code" value={String(native.responseCode)} />
              )}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Parsed</h2>
          <div className="grid grid-cols-2 gap-3">
            <ParsedTile label="ref (invitation)" value={parsed.ref} />
            <ParsedTile label="agencyCode" value={parsed.agencyCode} />
          </div>
          {parsed.allParams.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="mb-1 font-medium text-muted-foreground">All query params</div>
              <ul className="space-y-0.5 font-mono">
                {parsed.allParams.map(([k, v]) => (
                  <li key={k}>
                    <span className="text-muted-foreground">{k}</span> = <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              localStorage state
            </h2>
            <Button size="sm" variant="outline" onClick={clearAll}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear all
            </Button>
          </div>

          {parsed.ref && (
            <ConsumedRow
              label="Invitation ref consumed"
              consumed={refConsumed}
              hint="Becomes true after the new user signs up and trackUserInvitation() clears the key."
            />
          )}
          {parsed.agencyCode && (
            <ConsumedRow
              label="Agency code consumed"
              consumed={agencyConsumed}
              hint="Becomes true after JoinAgency loads and clears the key on auto-fill."
            />
          )}

          <ul className="space-y-2">
            {LS_KEYS.map((k) => (
              <li key={k} className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 p-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">{k}</div>
                  <div className="break-all font-mono text-sm">
                    {storage[k] ?? <span className="text-muted-foreground">(empty)</span>}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => clearKey(k)} aria-label={`Clear ${k}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={reprocess}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Re-process install referrer
          </Button>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`break-all ${mono ? "font-mono text-sm" : "text-sm"}`}>{value}</div>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" onClick={onCopy} aria-label="Copy">
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function ParsedTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-mono text-sm">
        {value ?? <span className="text-muted-foreground">(none)</span>}
      </div>
    </div>
  );
}

function ConsumedRow({ label, consumed, hint }: { label: string; consumed: boolean; hint: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-sm">
      {consumed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <div className="font-medium">
          {label}: <span className={consumed ? "text-emerald-500" : "text-amber-500"}>{consumed ? "yes" : "no"}</span>
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
