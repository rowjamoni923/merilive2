// Pkg236 — Play Integrity JS bridge
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface PlayIntegrityPlugin {
  prepare(): Promise<{ ready: boolean }>;
  requestToken(opts: { nonce?: string }): Promise<{ token: string }>;
}

const Native = registerPlugin<PlayIntegrityPlugin>("PlayIntegrity");

export const isPlayIntegrityAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export async function preparePlayIntegrity(): Promise<boolean> {
  if (!isPlayIntegrityAvailable()) return false;
  try {
    const r = await Native.prepare();
    return !!r?.ready;
  } catch (e) {
    console.warn("[PlayIntegrity] prepare failed", e);
    return false;
  }
}

export async function requestPlayIntegrityToken(
  nonce?: string,
): Promise<string | null> {
  if (!isPlayIntegrityAvailable()) return null;
  try {
    const r = await Native.requestToken({ nonce });
    return r?.token ?? null;
  } catch (e) {
    console.warn("[PlayIntegrity] requestToken failed", e);
    return null;
  }
}
