// Pkg139: Host-facing "My Recordings" gallery.
// Lists the host's own LiveKit recordings (Pkg111 MP4 + Pkg126 HLS + Pkg129 auto-record)
// and RTMP simulcasts (Pkg114). Read-only, manual refresh, RLS-scoped to host_id=auth.uid().
// Zero new Supabase Realtime channels, zero polls.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Film, Radio, Tv, Download, Play, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listMyRecordings } from "@/lib/livekitEgress";
import { listMyHlsRecordings } from "@/lib/livekitHlsEgress";
import { listMySimulcasts } from "@/lib/livekitStreamEgress";
import { toast } from "sonner";

type Row = Record<string, any>;

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  active: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  starting: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  ending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  aborted: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  limit_reached: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  recording: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  processing: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  expired: "bg-muted text-muted-foreground border-border",
};

function fmtBytes(n?: number | null) {
  if (!n || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtDuration(sec?: number | null) {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function MyRecordings() {
  const [tab, setTab] = useState<"mp4" | "hls" | "simulcast">("mp4");
  const [mp4, setMp4] = useState<Row[]>([]);
  const [hls, setHls] = useState<Row[]>([]);
  const [sim, setSim] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [inspect, setInspect] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([listMyRecordings(50), listMyHlsRecordings(50), listMySimulcasts(50)]);
      // Pkg111 lib selects all formats; filter to non-HLS for the MP4 tab.
      setMp4((a || []).filter((r: Row) => (r.format || "mp4") !== "hls"));
      setHls(b || []);
      setSim(c || []);
    } catch (e) {
      console.warn("[MyRecordings] load error", e);
      toast.error("Could not load recordings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    mp4: mp4.length,
    hls: hls.length,
    simulcast: sim.length,
    totalBytes: [...mp4, ...hls].reduce((s, r) => s + (Number(r.size_bytes) || Number(r.file_size_bytes) || 0), 0),
  }), [mp4, hls, sim]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container max-w-5xl mx-auto flex items-center gap-3 py-3 px-4">
          <Link to="/host-dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              My Recordings
            </h1>
            <p className="text-xs text-muted-foreground">Your live-stream replays and simulcast history</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Film className="h-4 w-4" />} label="MP4" value={stats.mp4} />
          <StatCard icon={<Tv className="h-4 w-4" />} label="HLS" value={stats.hls} />
          <StatCard icon={<Radio className="h-4 w-4" />} label="Simulcasts" value={stats.simulcast} />
          <StatCard icon={<Download className="h-4 w-4" />} label="Storage" value={fmtBytes(stats.totalBytes)} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="mp4"><Film className="h-4 w-4 mr-1" />MP4</TabsTrigger>
            <TabsTrigger value="hls"><Tv className="h-4 w-4 mr-1" />HLS</TabsTrigger>
            <TabsTrigger value="simulcast"><Radio className="h-4 w-4 mr-1" />Simulcast</TabsTrigger>
          </TabsList>

          <TabsContent value="mp4" className="mt-4">
            <RecordingList
              rows={mp4}
              empty="No MP4 recordings yet. Start recording from your live stream's More menu."
              renderUrl={(r) => r.file_url || r.recording_url}
              onInspect={setInspect}
            />
          </TabsContent>

          <TabsContent value="hls" className="mt-4">
            <RecordingList
              rows={hls}
              empty="No HLS recordings yet. Start an HLS recording for instant browser playback."
              renderUrl={(r) => r.playlist_url}
              onInspect={setInspect}
            />
          </TabsContent>

          <TabsContent value="simulcast" className="mt-4">
            <SimulcastList rows={sim} onInspect={setInspect} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recording details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs bg-muted/40 rounded-md p-3 whitespace-pre-wrap break-all">
              {inspect ? JSON.stringify(inspect, null, 2) : ""}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-base font-semibold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status || "unknown").toLowerCase();
  return <Badge variant="outline" className={STATUS_COLOR[s] || "bg-muted text-muted-foreground border-border"}>{s}</Badge>;
}

function RecordingList({
  rows, empty, renderUrl, onInspect,
}: {
  rows: Row[]; empty: string; renderUrl: (r: Row) => string | null | undefined; onInspect: (r: Row) => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <AlertCircle className="h-6 w-6 opacity-60" />
          {empty}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const url = renderUrl(r);
        const bytes = Number(r.size_bytes) || Number(r.file_size_bytes) || 0;
        return (
          <Card key={r.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                {r.format === "hls" ? <Tv className="h-5 w-5 text-primary" /> : <Film className="h-5 w-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{r.room_name || r.channel_name || r.stream_id?.slice(0, 8) || r.id.slice(0, 8)}</span>
                  <StatusBadge status={r.status} />
                  {r.auto_started && <Badge variant="secondary" className="text-[10px]">AUTO</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {fmtDate(r.started_at)} · {fmtDuration(r.duration_seconds)} · {fmtBytes(bytes)}
                </div>
                {r.error && <div className="text-xs text-rose-500 mt-1 truncate">⚠ {r.error}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {url && (
                  <>
                    <Button asChild size="sm" variant="ghost"><a href={url} target="_blank" rel="noreferrer"><Play className="h-4 w-4" /></a></Button>
                    <Button asChild size="sm" variant="ghost"><a href={url} download><Download className="h-4 w-4" /></a></Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => onInspect(r)}>•••</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SimulcastList({ rows, onInspect }: { rows: Row[]; onInspect: (r: Row) => void }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <AlertCircle className="h-6 w-6 opacity-60" />
          No simulcasts yet. Stream to YouTube / Facebook / Twitch from your live stream's More menu.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.id} className="hover:border-primary/40 transition-colors">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-12 w-12 rounded-md bg-gradient-to-br from-rose-500/20 to-rose-500/5 flex items-center justify-center shrink-0">
              <Radio className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{r.room_name || r.id.slice(0, 8)}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(r.providers || []).map((p: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] capitalize">{p}</Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {fmtDate(r.started_at)} · {fmtDuration(r.duration_seconds)}
              </div>
              {r.error && <div className="text-xs text-rose-500 mt-1 truncate">⚠ {r.error}</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => onInspect(r)}>•••</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
