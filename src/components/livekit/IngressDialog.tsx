/**
 * Pkg109: RTMP/WHIP Ingress host UI.
 *
 * Lets a host fetch or provision an ingress for their own live_streams room
 * so they can broadcast from OBS / external encoder. Stream key is masked by
 * default with a reveal toggle (single-tap copy buttons for URL + key).
 *
 * Server-side: livekit-ingress edge fn + `ingress` kill-switch (Pkg109).
 * No new Supabase Realtime channels, no polls, no cross-user reads.
 */
import { useCallback, useEffect, useState } from "react";
import { Radio, X, Copy, Eye, EyeOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLiveStreamIngress,
  deleteLiveStreamIngress,
  fetchLiveStreamIngress,
  type IngressCredentials,
  type IngressInputType,
} from "@/lib/livekitIngress";

interface Props {
  open: boolean;
  onClose: () => void;
  streamId: string | null | undefined;
}

export function IngressDialog({ open, onClose, streamId }: Props) {
  const [creds, setCreds] = useState<IngressCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputType, setInputType] = useState<IngressInputType>("rtmp");
  const [revealKey, setRevealKey] = useState(false);

  // Fetch existing creds when dialog opens
  useEffect(() => {
    if (!open || !streamId) return;
    let cancelled = false;
    setLoading(true);
    setRevealKey(false);
    fetchLiveStreamIngress(streamId)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          setCreds({ ...row, reused: true });
          setInputType(row.inputType);
        } else {
          setCreds(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, streamId]);

  const handleCreate = useCallback(async () => {
    if (!streamId) return;
    setLoading(true);
    try {
      const c = await createLiveStreamIngress(streamId, inputType);
      if (!c) {
        toast.error("Couldn't create stream source. Admin may have disabled it.");
        return;
      }
      setCreds(c);
      toast.success(c.reused ? "Stream source ready" : "Stream source created");
    } finally {
      setLoading(false);
    }
  }, [streamId, inputType]);

  const handleDelete = useCallback(async () => {
    if (!streamId) return;
    setLoading(true);
    const ok = await deleteLiveStreamIngress(streamId);
    setLoading(false);
    if (ok) {
      setCreds(null);
      toast.success("Stream source removed");
    } else {
      toast.error("Couldn't remove stream source");
    }
  }, [streamId]);

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  const maskedKey = creds?.streamKey
    ? revealKey
      ? creds.streamKey
      : `${creds.streamKey.slice(0, 4)}${"•".repeat(Math.max(8, creds.streamKey.length - 8))}${creds.streamKey.slice(-4)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-rose-500" />
            Stream Source (OBS / RTMP)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Push video into your live room from OBS, a hardware encoder, or any
            RTMP/WHIP source.
          </p>

          {!creds && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={inputType === "rtmp" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInputType("rtmp")}
                  disabled={loading}
                >
                  RTMP / RTMPS
                </Button>
                <Button
                  variant={inputType === "whip" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInputType("whip")}
                  disabled={loading}
                >
                  WHIP (WebRTC)
                </Button>
              </div>
              <Button
                onClick={handleCreate}
                disabled={loading || !streamId}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Radio className="h-4 w-4 mr-2" />
                )}
                Create Stream Source
              </Button>
            </div>
          )}

          {creds && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Server URL
                </label>
                <div className="flex gap-2">
                  <Input value={creds.url} readOnly className="font-mono text-xs" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copy("URL", creds.url)}
                    aria-label="Copy URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Stream Key {creds.inputType === "whip" ? "(bearer token)" : ""}
                </label>
                <div className="flex gap-2">
                  <Input value={maskedKey} readOnly className="font-mono text-xs" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setRevealKey((v) => !v)}
                    aria-label={revealKey ? "Hide key" : "Show key"}
                  >
                    {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copy("Stream key", creds.streamKey)}
                    aria-label="Copy stream key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Keep this key private — anyone with it can broadcast as you.
                </p>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">OBS quick setup:</strong> Settings →
                Stream → Service <em>Custom</em>, paste Server URL + Stream Key,
                then Start Streaming. Recommended: 1080p30, 4–6 Mbps, H.264.
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default IngressDialog;
