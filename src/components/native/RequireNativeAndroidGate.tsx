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

export function RequireNativeAndroidGate({ children }: RequireNativeAndroidGateProps) {
  // Browser live streaming enabled — gate is now a pass-through.
  // Native Android still works via existing isNativeAndroid branches downstream;
  // web browsers now use getUserMedia + LiveKit web SDK.
  return <>{children}</>;
}

export default RequireNativeAndroidGate;
