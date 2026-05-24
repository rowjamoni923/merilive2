import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Bug, Copy, Check } from "lucide-react";
import { extractAdminStoragePath, resolveAdminStorageObjectUrl, resolveAdminStorageSignedUrl } from "@/utils/adminStorageImages";
import { getAdminSessionToken } from "@/utils/adminSession";

type MediaInput = { label: string; raw?: string | null };

interface Row {
  label: string;
  raw: string;
  bucket: string;
  path: string;
  signed: string;
  error?: string;
  status?: number | null;
}

const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n) + "…" + s.slice(-12) : s);

const probe = async (url: string): Promise<number | null> => {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return null;
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status;
  } catch {
    return 0;
  }
};

export const FaceVerificationDebugPanel = ({ items }: { items: MediaInput[] }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const adminToken = getAdminSessionToken();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: Row[] = [];
      for (const it of items) {
        const raw = (it.raw || "").trim();
        if (!raw) {
          out.push({ label: it.label, raw: "(empty)", bucket: "—", path: "—", signed: "—" });
          continue;
        }
        const parsed = extractAdminStoragePath(raw, "face-verification");
        let signed = "";
        let error: string | undefined;
        try {
          signed = (await resolveAdminStorageObjectUrl(raw, "face-verification")) || "";
        } catch (e: unknown) {
          error = e instanceof Error ? e.message : String(e);
        }
        const status = signed ? await probe(signed) : null;
        out.push({
          label: it.label,
          raw,
          bucket: parsed?.bucket || "—",
          path: parsed?.path || "—",
          signed: signed || "(failed)",
          error,
          status,
        });
      }
      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, items]);

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    });
  };

  const tokenBadge = adminToken
    ? <span className="text-emerald-400">present ({adminToken.length} chars)</span>
    : <span className="text-red-400">MISSING — signing will fail</span>;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-amber-300 font-medium hover:bg-amber-500/10 rounded-t-xl"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Bug className="w-3.5 h-3.5" />
        Media Debug Panel
        <span className="ml-auto text-amber-200/70 font-normal">x-admin-token: {tokenBadge}</span>
      </button>
      {open && (
        <div className="border-t border-amber-500/20 p-3 space-y-2 max-h-96 overflow-auto">
          {loading && <p className="text-amber-200/80">Resolving signed URLs…</p>}
          {!loading && rows.map((r, i) => {
            const ok = typeof r.status === "number" && r.status >= 200 && r.status < 400;
            return (
              <div key={i} className="rounded-lg bg-background/60 border border-border/50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-purple-300">{r.label}</span>
                  <span className={ok ? "text-emerald-400" : r.status === null ? "text-muted-foreground" : "text-red-400"}>
                    HTTP {r.status ?? "—"}
                  </span>
                </div>
                <DebugRow k={`raw-${i}`} label="raw" value={r.raw} copiedKey={copiedKey} onCopy={copy} />
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">bucket:</span> <span className="text-foreground">{r.bucket}</span></div>
                  <DebugRow k={`path-${i}`} label="path" value={r.path} copiedKey={copiedKey} onCopy={copy} />
                </div>
                <DebugRow k={`signed-${i}`} label="signed" value={r.signed} copiedKey={copiedKey} onCopy={copy} />
                {r.error && <p className="text-red-400">error: {r.error}</p>}
              </div>
            );
          })}
          {!loading && rows.length === 0 && (
            <p className="text-amber-200/60">No media on this submission.</p>
          )}
        </div>
      )}
    </div>
  );
};

const DebugRow = ({
  k, label, value, copiedKey, onCopy,
}: { k: string; label: string; value: string; copiedKey: string | null; onCopy: (k: string, v: string) => void }) => (
  <div className="flex items-start gap-2">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <code className="font-mono break-all text-[11px] text-foreground/90 flex-1">{short(value, 90)}</code>
    <button type="button" onClick={() => onCopy(k, value)} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy full">
      {copiedKey === k ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  </div>
);
