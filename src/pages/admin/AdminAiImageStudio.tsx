import { useState, useEffect } from "react";
import { Sparkles, Wand2, Loader2, Copy, Download, ImageIcon, Send, Trash2, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Banner size presets — must match supabase/functions/generate-event-banner/index.ts
const BANNER_SIZES: { key: string; label: string; w: number; h: number }[] = [
  { key: "banner_16_9_1920", label: "Hero · 1920×1080 (16:9)", w: 1920, h: 1080 },
  { key: "banner_16_9_1280", label: "Standard · 1280×720 (16:9)", w: 1280, h: 720 },
  { key: "square_1080",      label: "Square · 1080×1080 (1:1)", w: 1080, h: 1080 },
  { key: "story_1080",       label: "Story / Reel · 1080×1920 (9:16)", w: 1080, h: 1920 },
  { key: "portrait_4_5",     label: "Portrait · 1080×1350 (4:5)", w: 1080, h: 1350 },
  { key: "wide_3_2",         label: "Wide · 1500×1000 (3:2)", w: 1500, h: 1000 },
  { key: "push_thumb",       label: "Push Thumbnail · 512×512 (1:1)", w: 512, h: 512 },
];

const PRESET_GROUPS: { group: string; items: string[] }[] = [
  { group: "💎 Recharge & Diamonds", items: ["Recharge Mega Offer", "Double Diamond Bonus", "Flash Recharge Sale", "Diamond Rush Weekend", "First Recharge Gift", "Weekend Top-Up Bonus", "VIP Recharge Pack"] },
  { group: "👑 VIP & Noble", items: ["VIP Launch", "Noble Coronation", "Royal Membership Sale", "Crown Upgrade Event", "VIP Exclusive Gala", "Noble Anniversary"] },
  { group: "🎤 Live & Host", items: ["Host Of The Week", "Golden Hour 3x Earnings", "Live Battle Royale", "PK Championship", "New Host Welcome Bonus", "5-Hour Live Milestone", "Top Streamer Awards", "Weekly Streaming Bonus"] },
  { group: "🎁 Gifts & Earnings", items: ["Gift Storm Event", "Double Beans Weekend", "Lucky Gift Lottery", "Mega Gift Carnival", "Gifter Of The Month", "Charm Leaderboard Final"] },
  { group: "🏆 Tournament & PK", items: ["Weekly Tournament", "Monthly Championship", "Season Grand Finale", "Wealth Ranking Battle", "Game Leaderboard Showdown"] },
  { group: "🎊 Festivals & Holidays", items: ["Eid Special", "Ramadan Kareem", "Diwali Lights", "Christmas Gala", "New Year Event", "Holi Color Fest", "Chinese New Year", "Thanksgiving Bonus", "Valentine Special", "Summer Carnival"] },
  { group: "👥 Referral & Growth", items: ["Referral Mania", "Invite & Earn Bonus", "Friend Reward Weekend", "Top Inviter Awards"] },
  { group: "🎂 User Moments", items: ["Birthday Bash", "Anniversary Celebration", "Welcome Bonus", "Level Up Reward", "Daily Check-in Mega"] },
  { group: "🏢 Agency & Helper", items: ["Agency Champions", "Top Agency Of The Week", "Helper Recharge Bonanza", "Agency Recruitment Drive"] },
];

interface GeneratedItem {
  eventName: string;
  url: string;
  sizeLabel: string;
  w: number;
  h: number;
  createdAt: number;
}

const HISTORY_KEY = "admin_ai_image_studio_history_v1";
const HISTORY_MAX = 200;

function loadHistory(): GeneratedItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}

function saveHistory(items: GeneratedItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX))); } catch {}
}

export default function AdminAiImageStudio() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [sizeKey, setSizeKey] = useState<string>("banner_16_9_1920");
  const [generating, setGenerating] = useState<string | null>(null);
  const [items, setItems] = useState<GeneratedItem[]>(() => loadHistory());
  const [broadcasting, setBroadcasting] = useState<string | null>(null);

  // Persist gallery to localStorage so history survives reload.
  useEffect(() => { saveHistory(items); }, [items]);


  const generate = async (eventName: string) => {
    const name = eventName.trim();
    if (!name) {
      toast({ title: "Enter a prompt", description: "Type what you want to generate", variant: "destructive" });
      return;
    }
    setGenerating(name);
    try {
      const { data, error } = await supabase.functions.invoke("generate-event-banner", {
        body: { eventName: name, sizeKey },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No URL returned");
      const sz = data.size || BANNER_SIZES.find(s => s.key === sizeKey)!;
      const w = sz.width ?? sz.w;
      const h = sz.height ?? sz.h;
      setItems(prev => [
        { eventName: name, url: data.url, sizeLabel: sz.label || `${w}×${h}`, w, h, createdAt: Date.now() },
        ...prev,
      ].slice(0, HISTORY_MAX));
      toast({ title: "Image generated", description: `Premium 3D · ${w}×${h}` });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "AI error", variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Copied", description: "Image URL copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const downloadImage = async (eventName: string, url: string, w: number, h: number) => {
    try {
      const res = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48)}-${w}x${h}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not download", variant: "destructive" });
    }
  };

  const broadcastAsPush = async (eventName: string, url: string) => {
    setBroadcasting(url);
    try {
      const { error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          title: eventName,
          body: `${eventName} — tap to see more!`,
          imageUrl: url,
          type: "broadcast",
        },
      });
      if (error) throw error;
      toast({ title: "Push sent", description: `Broadcast "${eventName}" with image` });
    } catch (e: any) {
      toast({ title: "Push failed", description: e?.message || "Broadcast error", variant: "destructive" });
    } finally {
      setBroadcasting(null);
    }
  };

  return (
    <div className="admin-content space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-xl p-3 bg-gradient-to-br from-amber-500/20 via-fuchsia-500/15 to-violet-600/20 ring-1 ring-amber-300/30">
          <Wand2 className="w-6 h-6 text-amber-300" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 bg-gradient-to-r from-amber-200 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
            AI Photo Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate premium 3D event banners, push thumbnails, and social images with AI — then download or push instantly.
          </p>
        </div>
      </div>

      {/* Generator card */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-fuchsia-500/5 to-violet-600/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" /> Create New Image
          </CardTitle>
          <CardDescription>Type any subject (event, product, theme) — pick a size — click Generate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Size selector */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Output Size</Label>
            <select
              value={sizeKey}
              onChange={(e) => setSizeKey(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
            >
              {BANNER_SIZES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Prompt input */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt / Event Name</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Diwali Diamond Mega Sale" or "Cyberpunk neon city skyline"'
                onKeyDown={(e) => { if (e.key === "Enter" && prompt.trim()) generate(prompt.trim()); }}
                className="flex-1"
              />
              <Button
                onClick={() => prompt.trim() && generate(prompt.trim())}
                disabled={!prompt.trim() || generating !== null}
                className="bg-gradient-to-r from-amber-500 via-fuchsia-500 to-violet-600 text-white"
              >
                {generating === prompt.trim() ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                ) : (
                  <><Wand2 className="w-4 h-4 mr-2" /> Generate</>
                )}
              </Button>
            </div>
          </div>

          {/* Preset chips */}
          <div className="space-y-3 pt-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quick Presets</Label>
            {PRESET_GROUPS.map(group => (
              <div key={group.group}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">{group.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map(item => (
                    <Button
                      key={item}
                      variant="outline"
                      size="sm"
                      disabled={generating !== null}
                      onClick={() => generate(item)}
                      className="h-7 text-xs"
                    >
                      {generating === item ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1 text-amber-300" />}
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gallery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" /> Generated Gallery
            <Badge variant="outline" className="ml-2">{items.length}</Badge>
          </CardTitle>
          <CardDescription>Last 60 images stay in this session. Download or push to users instantly.</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="admin-empty-state text-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No images yet — type a prompt above or click any preset chip.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((it, idx) => (
                <div key={`${it.url}-${idx}`} className="rounded-xl overflow-hidden border border-border bg-card/40 group">
                  <div className="relative aspect-video bg-black/40 flex items-center justify-center">
                    <img
                      src={it.url}
                      alt={it.eventName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{it.eventName}</div>
                        <div className="text-xs text-muted-foreground">{it.sizeLabel}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadImage(it.eventName, it.url, it.w, it.h)}>
                        <Download className="w-3 h-3 mr-1" /> Download
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyUrl(it.url)}>
                        <Copy className="w-3 h-3 mr-1" /> Copy URL
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white"
                        disabled={broadcasting === it.url}
                        onClick={() => broadcastAsPush(it.eventName, it.url)}
                      >
                        {broadcasting === it.url
                          ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Pushing…</>
                          : <><Send className="w-3 h-3 mr-1" /> Push to All</>}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
