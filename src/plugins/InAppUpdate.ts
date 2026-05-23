import { registerPlugin, Capacitor, type PluginListenerHandle } from "@capacitor/core";

export type InstallStatus =
  | "PENDING" | "DOWNLOADING" | "DOWNLOADED" | "INSTALLING"
  | "INSTALLED" | "FAILED" | "CANCELED" | "REQUIRES_UI_INTENT" | "UNKNOWN";

export interface CheckResult {
  available: boolean;
  immediate: boolean;
  flexible: boolean;
  versionCode: number;
  stalenessDays: number;
  installStatus: InstallStatus;
}

export interface InAppUpdatePlugin {
  check(): Promise<CheckResult>;
  start(opts: { mode: "flexible" | "immediate" }): Promise<{ started: boolean; mode: string }>;
  complete(): Promise<void>;
  addListener(
    eventName: "installStateUpdated",
    cb: (e: { status: InstallStatus; bytesDownloaded: number; totalBytesToDownload: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const native = registerPlugin<InAppUpdatePlugin>("InAppUpdate");

const isAndroid = () =>
  typeof Capacitor !== "undefined" &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === "android";

/** Pkg224 — Safe wrapper. No-op on web / iOS. */
export const InAppUpdate = {
  isSupported: isAndroid,
  async check(): Promise<CheckResult | null> {
    if (!isAndroid()) return null;
    try { return await native.check(); } catch { return null; }
  },
  async start(mode: "flexible" | "immediate" = "flexible") {
    if (!isAndroid()) return false;
    try { const r = await native.start({ mode }); return r.started; } catch { return false; }
  },
  async complete() {
    if (!isAndroid()) return;
    try { await native.complete(); } catch {}
  },
  addListener(cb: Parameters<InAppUpdatePlugin["addListener"]>[1]) {
    if (!isAndroid()) return Promise.resolve({ remove: async () => {} } as PluginListenerHandle);
    return native.addListener("installStateUpdated", cb);
  },
};
