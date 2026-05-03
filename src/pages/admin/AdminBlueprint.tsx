import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Image, Loader2, LayoutTemplate } from "lucide-react";
import html2canvas from "html2canvas";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { recordAdminError } from "@/utils/adminErrorLog";

const BLUEPRINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MeriLive Blueprint</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0b1020; color: #e5e7eb; }
    .hero { padding: 40px 24px 28px; background: linear-gradient(135deg, #111827 0%, #0f172a 50%, #1e1b4b 100%); }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.12); color: #fbbf24; font-size: 12px; font-weight: 700; letter-spacing: .04em; }
    h1 { margin: 14px 0 8px; font-size: 34px; line-height: 1.1; }
    p { margin: 0; color: #94a3b8; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 24px; }
    .card { border: 1px solid rgba(148, 163, 184, 0.16); background: rgba(15, 23, 42, 0.88); border-radius: 18px; padding: 18px; box-shadow: 0 20px 40px -28px rgba(0,0,0,0.45); }
    .num { font-size: 28px; font-weight: 800; color: #fff; }
    .label { margin-top: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; }
    .section { padding: 0 24px 24px; }
    .section h2 { margin: 0 0 14px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .panel { border: 1px solid rgba(148, 163, 184, 0.16); background: linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9)); border-radius: 18px; padding: 18px; }
    .panel h3 { margin: 0 0 10px; font-size: 16px; color: #fff; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .chip { padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 12px; }
    ul { margin: 10px 0 0; padding-left: 18px; color: #cbd5e1; }
    li { margin: 6px 0; }
    .footer { padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
    @media (max-width: 900px) {
      .stats, .grid { grid-template-columns: 1fr; }
      h1 { font-size: 28px; }
    }
  </style>
</head>
<body>
  <section class="hero">
    <span class="badge">Internal Admin Blueprint</span>
    <h1>MeriLive Platform Blueprint</h1>
    <p>High-level architecture map covering user app flows, admin operations, data domains, and core route groups.</p>
  </section>

  <section class="stats">
    <div class="card"><div class="num">70+</div><div class="label">Core app routes</div></div>
    <div class="card"><div class="num">60+</div><div class="label">Admin pages</div></div>
    <div class="card"><div class="num">50+</div><div class="label">Primary data tables</div></div>
    <div class="card"><div class="num">10</div><div class="label">Feature modules</div></div>
  </section>

  <section class="section">
    <h2>Primary route groups</h2>
    <div class="grid">
      <div class="panel">
        <h3>User-facing app</h3>
        <div class="chips">
          <span class="chip">Home</span>
          <span class="chip">Discover</span>
          <span class="chip">Live Stream</span>
          <span class="chip">Party Rooms</span>
          <span class="chip">Reels</span>
          <span class="chip">Profile</span>
          <span class="chip">Messages</span>
          <span class="chip">Leaderboard</span>
        </div>
        <ul>
          <li>Home feed, search, profiles, follow flows</li>
          <li>Live room view, gifting, call entry, audience actions</li>
          <li>Party room creation and seat/participant management</li>
        </ul>
      </div>
      <div class="panel">
        <h3>Admin operations</h3>
        <div class="chips">
          <span class="chip">Dashboard</span>
          <span class="chip">Users</span>
          <span class="chip">Hosts</span>
          <span class="chip">Finance</span>
          <span class="chip">Reports</span>
          <span class="chip">Assets</span>
          <span class="chip">Settings</span>
          <span class="chip">Moderation</span>
        </div>
        <ul>
          <li>Server-side aggregated stats and moderation control</li>
          <li>Pricing, commissions, recharge, withdrawal oversight</li>
          <li>Frames, gifts, entry assets, chat and content management</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>System modules</h2>
    <div class="grid">
      <div class="panel">
        <h3>Economy & identity</h3>
        <ul>
          <li>Diamonds for spend, Beans for host earnings</li>
          <li>Face verification and role-controlled host activation</li>
          <li>Agency, helper, and payout validation flows</li>
        </ul>
      </div>
      <div class="panel">
        <h3>Realtime & operations</h3>
        <ul>
          <li>Push-based admin updates without polling loops</li>
          <li>Centralized admin error logging and alert surface</li>
          <li>Performance-safe routing and capped admin fetch patterns</li>
        </ul>
      </div>
    </div>
  </section>

  <div class="footer">MeriLive Blueprint • Internal use only • Supabase-backed architecture</div>
</body>
</html>`;

export default function AdminBlueprint() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleDownloadPDF = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) iframe.contentWindow.print();
  };

  const handleDownloadHTML = () => {
    const blob = new Blob([BLUEPRINT_HTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MeriLive_Blueprint.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;

    setIsCapturing(true);
    try {
      const canvas = await html2canvas(iframe.contentDocument.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0b1020",
        width: iframe.contentDocument.body.scrollWidth,
        height: iframe.contentDocument.body.scrollHeight,
        windowWidth: iframe.contentDocument.body.scrollWidth,
        windowHeight: iframe.contentDocument.body.scrollHeight,
      });

      const link = document.createElement("a");
      link.download = "MeriLive_Blueprint.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      recordAdminError({
        kind: "other",
        label: "AdminBlueprint.handleDownloadPNG",
        message: err instanceof Error ? err.message : "PNG capture failed",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="App Blueprint"
        subtitle="High-level route and architecture map for internal admin review"
        icon={LayoutTemplate}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownloadPNG} variant="default" className="gap-2" disabled={isCapturing}>
              {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              {isCapturing ? "Capturing..." : "Download PNG"}
            </Button>
            <Button onClick={handleDownloadPDF} variant="secondary" className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={handleDownloadHTML} variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Download HTML
            </Button>
          </div>
        }
      />

      <div
        className="overflow-hidden rounded-2xl border border-[hsl(var(--admin-border-light)/0.8)] bg-[hsl(var(--background))] shadow-[0_20px_40px_-28px_hsl(var(--admin-accent)/0.38)]"
        style={{ height: "calc(100vh - 208px)" }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={BLUEPRINT_HTML}
          className="h-full w-full border-0"
          title="MeriLive Blueprint"
        />
      </div>
    </div>
  );
}
