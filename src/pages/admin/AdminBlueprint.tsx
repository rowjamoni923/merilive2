import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Image, Loader2, LayoutTemplate } from "lucide-react";
import html2canvas from "html2canvas";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { recordAdminError } from "@/utils/adminErrorLog";

const BLUEPRINT_HTML = `<!-- Full Blueprint Content -->
...
export default function AdminBlueprint() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleDownloadPDF = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleDownloadHTML = () => {
    const blob = new Blob([BLUEPRINT_HTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MeriLive_Blueprint_v9.html";
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
        backgroundColor: "#faf8f5",
        width: iframe.contentDocument.body.scrollWidth,
        height: iframe.contentDocument.body.scrollHeight,
        windowWidth: iframe.contentDocument.body.scrollWidth,
        windowHeight: iframe.contentDocument.body.scrollHeight,
      });

      const link = document.createElement("a");
      link.download = "MeriLive_Blueprint_v9.png";
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
        subtitle="Complete A-Z wireframe map with DB mapping for internal admin review"
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

      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--admin-border-light)/0.8)] bg-[hsl(var(--background))] shadow-[0_20px_40px_-28px_hsl(var(--admin-accent)/0.38)]" style={{ height: "calc(100vh - 208px)" }}>
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
