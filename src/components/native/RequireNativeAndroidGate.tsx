/**
 * Pkg153 — Native-Android-only gate for camera/mic features (Live / Call / Party).
 *
 * Policy: per user directive — Live Stream, Private Call, and Party Room MUST use
 * the original Android camera (Camera2/CameraX) via the NativeLiveKit Capacitor
 * plugin. Web browser getUserMedia is BLOCKED across the board. When a user opens
 * any of these pages from a desktop or mobile web browser, this gate replaces the
 * page with a full-screen "Please use the Android app" screen.
 *
 * 📱 PORTRAIT CAMERA ONLY rule preserved — the gate itself is portrait-friendly.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { ReactNode } from "react";
import { Smartphone, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { isNativeAndroidApp } from "@/utils/nativeUtils";

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
    title: "Private Call — Android app required",
    body: "Private video calls run on the native Android camera. Please open the MeriLive Android app to call.",
  },
  party: {
    title: "Party Room — Android app required",
    body: "Party Rooms use the native Android camera and microphone. Please open the MeriLive Android app to join.",
  },
};

export function RequireNativeAndroidGate({ feature, children }: RequireNativeAndroidGateProps) {
  if (isNativeAndroidApp()) return <>{children}</>;

  const navigate = useNavigate();
  const copy = FEATURE_COPY[feature];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-6 rounded-full bg-primary/10 p-6">
        <Smartphone className="h-16 w-16 text-primary" />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-foreground">{copy.title}</h1>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          variant="luxury"
          className="w-full"
          onClick={() => {
            window.location.href = "https://play.google.com/store/apps/details?id=app.lovable.1c59f8d275bb4fc1a0743c08560dd44b";
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          Get the Android App
        </Button>
        <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

export default RequireNativeAndroidGate;
