import { registerPlugin, Capacitor } from "@capacitor/core";

export interface AppLocalePlugin {
  setAppLocale(opts: { language: string }): Promise<{ language: string; api?: number }>;
  getAppLocale(): Promise<{ language: string }>;
}

const native = registerPlugin<AppLocalePlugin>("AppLocale");

/**
 * Pkg222 — Per-app language wrapper. No-op on non-Android platforms so the
 * web preview and iOS keep using i18next/localStorage only.
 */
export const AppLocale: AppLocalePlugin = {
  async setAppLocale(opts) {
    if (Capacitor.getPlatform() !== "android") return { language: opts.language };
    try {
      return await native.setAppLocale(opts);
    } catch (e) {
      console.warn("[AppLocale] setAppLocale failed", e);
      return { language: opts.language };
    }
  },
  async getAppLocale() {
    if (Capacitor.getPlatform() !== "android") return { language: "" };
    try {
      return await native.getAppLocale();
    } catch {
      return { language: "" };
    }
  },
};
