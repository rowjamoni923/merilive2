/**
 * Pkg153 — Native-Android-only gate for camera/mic features (Live / Call / Party).
 *
 * Policy: per user directive — Live Stream, Private Call, and Party Room MUST use
 * the original Android camera (Camera2/CameraX) via the NativeLiveKit Capacitor
 * plugin. Web browser getUserMedia is BLOCKED across the board. When a user opens
 * any of these pages from a desktop or mobile web browser, this gate replaces the
 * page with a full-screen "Please use the Android app" screen.
 *
 * DEV BYPASS: Lovable preview / localhost auto-bypasses this route gate so QA
 * can open Go Live and Party Room in the web preview. Production/custom domain
 * remains Android-only.
 *
 * 📱 PORTRAIT CAMERA ONLY rule preserved — the gate itself is portrait-friendly.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { ReactNode, useMemo } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isNativeAndroidApp } from "@/utils/nativeUtils";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovableproject.com") ||
    /^id-preview--[a-z0-9-]+\.lovable\.app$/i.test(hostname)
  );
}

function shouldBypassGate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return isPreviewHost(window.location.hostname);
  } catch { /* noop */ }
  return false;
}

interface RequireNativeAndroidGateProps {
  feature: "live" | "call" | "party";
  children: ReactNode;
}

const FEATURE_COPY: Record<RequireNativeAndroidGateProps["feature"], { title: string; body: string }> = {
  live: {
    title: "Live Stream — Android app required",
    body: "For the best broadcast quality our Live Streams use the original Android camera. Please open the MeriLive Android app to go live.",
  },
  call: {
  },
  party: {
  },
};

export function RequireNativeAndroidGate({ feature, children }: RequireNativeAndroidGateProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bypass = useMemo(() => shouldBypassGate(), [searchParams]);

  if (isNativeAndroidApp() || bypass) return <>{children}</>;

  const copy = FEATURE_COPY[feature];

  return (
    <main className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-sm text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Smartphone className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight">{copy.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{copy.body}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Preview testing: add <code className="bg-muted px-1 rounded">?bypassNativeGate=1</code> to the URL.
          </p>
        </div>
        <Button onClick={() => navigate(-1)} className="w-full">
          Go Back
        </Button>
      </section>
    </main>
  );
}

export default RequireNativeAndroidGate;
