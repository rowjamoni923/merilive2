// N3 — OBS / RTMP Ingress setup page for pro hosts.
// Lets a host generate a LiveKit Ingress (RTMP or WHIP) for their account.
// The ingress publishes a track into a real `live_streams` row, so viewers
// see the OBS-broadcaster as if they were a regular host.

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Check, Radio, Trash2, Loader2, Video, Mic, Info, ExternalLink, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type IngressType = "rtmp" | "whip";

interface OBSStream {
  id: string;
  title: string;
  is_active: boolean;
  ingress_id: string | null;
  rtmp_url: string | null;
  stream_key: string | null;
  ingress_type: IngressType | null;
  started_at: string | null;
}

const OBS_TITLE_PREFIX = "[OBS] ";

export default function OBSStreamSetup() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState<OBSStream | null>(null);
  const [title, setTitle] = useState("");
  const [inputType, setInputType] = useState<IngressType>("rtmp");
  const [copied, setCopied] = useState<string | null>(null);

  const loadActive = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("live_streams")
      .select("id, title, is_active, ingress_id, rtmp_url, stream_key, ingress_type, started_at")
      .eq("host_id", uid)
      .eq("is_active", true)
      .like("title", `${OBS_TITLE_PREFIX}%`)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[OBS] loadActive failed:", error.message);
    }
    setStream((data as OBSStream | null) ?? null);
    if (data?.ingress_type) setInputType(data.ingress_type as IngressType);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;
        setUserId(uid);
        if (!uid) {
          toast.error("Please log in");
          navigate("/auth");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", uid)
          .maybeSingle();
        setTitle(`${profile?.display_name ?? "Host"} (OBS)`);
        await loadActive(uid);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadActive, navigate]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  };

  const handleStart = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      // 1. Create live_streams row marked as OBS
      const finalTitle = `${OBS_TITLE_PREFIX}${title.trim() || "Host (OBS)"}`;
      const { data: row, error: insertErr } = await supabase
        .from("live_streams")
        .insert({
          host_id: userId,
          title: finalTitle,
          is_active: true,
          started_at: new Date().toISOString(),
          viewer_count: 0,
          total_coins_earned: 0,
        })
        .select("id, title, is_active, ingress_id, rtmp_url, stream_key, ingress_type, started_at")
        .single();
      if (insertErr || !row) throw insertErr ?? new Error("Failed to create stream");

      // 2. Call edge function to create LiveKit ingress
      const { data: ing, error: ingErr } = await supabase.functions.invoke("livekit-ingress", {
        body: { streamId: row.id, action: "create", inputType },
      });
      if (ingErr) throw ingErr;
      if ((ing as any)?.error) throw new Error((ing as any).error);

      toast.success(`${inputType.toUpperCase()} ingress ready`);
      await loadActive(userId);
    } catch (e: any) {
      console.error("[OBS] start failed", e);
      const msg = e?.message ?? "Failed to start OBS stream";
      if (msg === "ingress_disabled") {
        toast.error("Ingress is currently disabled on the server. Contact admin.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!userId || !stream) return;
    setBusy(true);
    try {
      // 1. Delete LiveKit ingress
      try {
        await supabase.functions.invoke("livekit-ingress", {
          body: { streamId: stream.id, action: "delete" },
        });
      } catch (e) {
        console.warn("[OBS] delete ingress failed (continuing):", e);
      }
      // 2. End live_streams row
      await supabase
        .from("live_streams")
        .update({ is_active: false, ended_at: new Date().toISOString(), viewer_count: 0 })
        .eq("id", stream.id);
      toast.success("OBS stream stopped");
      setStream(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to stop stream");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">OBS / RTMP Streaming</h1>
            <p className="text-xs text-muted-foreground">Stream from desktop via OBS, Streamlabs, etc.</p>
          </div>
          <Radio className="w-5 h-5 text-primary" />
        </div>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {stream && stream.rtmp_url && stream.stream_key ? (
          <>
            {/* Live status */}
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Ingress Active</p>
                  <p className="text-xs text-muted-foreground">
                    {stream.ingress_type === "whip" ? "WHIP" : "RTMP"} input ready — paste into your encoder
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">{stream.id.slice(0, 8)}</Badge>
              </CardContent>
            </Card>

            {/* Credentials */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  Stream credentials
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {stream.ingress_type === "whip" ? "WHIP URL" : "Server URL (RTMP)"}
                  </Label>
                  <div className="flex gap-2">
                    <Input value={stream.rtmp_url} readOnly className="font-mono text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copy("Server URL", stream.rtmp_url!)}
                    >
                      {copied === "Server URL" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Stream Key
                  </Label>
                  <div className="flex gap-2">
                    <Input value={stream.stream_key} readOnly type="password" className="font-mono text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copy("Stream Key", stream.stream_key!)}
                    >
                      {copied === "Stream Key" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Keep this key private. Anyone with it can stream as you.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* OBS setup guide */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  OBS Studio setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Step n={1} text="Open OBS Studio → Settings → Stream" />
                <Step n={2} text='Service: choose "Custom..."' />
                <Step n={3} text="Server: paste the Server URL above" />
                <Step n={4} text="Stream Key: paste the Stream Key above" />
                <Step n={5} text="Output → Video Bitrate: 2500-4500 Kbps (1080p30)" />
                <Step n={6} text='Output → Encoder: x264 / hardware (NVENC/QuickSync)' />
                <Step n={7} text='Click "Start Streaming" — viewers will see you live in your app' />
                <Separator />
                <Alert>
                  <Video className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    Recommended: <strong>1920×1080 @ 30fps</strong>, keyframe interval <strong>2s</strong>,
                    Audio <strong>Opus / AAC 96 kbps stereo</strong>.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Stop */}
            <Button
              variant="destructive"
              className="w-full h-12"
              onClick={handleStop}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Stop OBS Stream & Delete Ingress
            </Button>
          </>
        ) : (
          <>
            {/* Create form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Power className="w-4 h-4" />
                  Start a new OBS stream
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Stream title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My OBS stream"
                    maxLength={80}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Input protocol</Label>
                  <RadioGroup
                    value={inputType}
                    onValueChange={(v) => setInputType(v as IngressType)}
                    className="grid grid-cols-2 gap-2"
                  >
                    <Label
                      htmlFor="rtmp"
                      className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        inputType === "rtmp" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value="rtmp" id="rtmp" />
                      <div>
                        <p className="text-sm font-semibold">RTMP</p>
                        <p className="text-[10px] text-muted-foreground">OBS / Streamlabs</p>
                      </div>
                    </Label>
                    <Label
                      htmlFor="whip"
                      className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                        inputType === "whip" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value="whip" id="whip" />
                      <div>
                        <p className="text-sm font-semibold">WHIP</p>
                        <p className="text-[10px] text-muted-foreground">Sub-second latency</p>
                      </div>
                    </Label>
                  </RadioGroup>
                </div>

                <Alert>
                  <Mic className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    Starting will create a live stream session and unique credentials.
                    Viewers will see you live as soon as OBS connects.
                  </AlertDescription>
                </Alert>

                <Button
                  className="w-full h-12"
                  onClick={handleStart}
                  disabled={busy || !title.trim()}
                >
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
                  Generate {inputType.toUpperCase()} credentials
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ExternalLink className="w-4 h-4" />
                  What is this?
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Instead of streaming from your phone camera, broadcast from a desktop encoder
                  (OBS Studio, Streamlabs, vMix, etc.) for pro quality — multi-cam, screen share,
                  custom overlays, music. Your viewers see you live in the app like normal.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
        {n}
      </div>
      <p className="text-sm pt-0.5">{text}</p>
    </div>
  );
}
