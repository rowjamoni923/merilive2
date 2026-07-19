/**
 * LiveKitNativeBridge.ts — Production v2.0
 * 
 * TypeScript bridge for LiveKitNativePlugin.kt (Capacitor)
 * 
 * Features:
 * ✅ Auto-fallback to WebView livekit-client when native unavailable
 * ✅ Event listeners for track attach/detach/disconnect
 * ✅ Connection state tracking
 * ✅ Mirror and scaling control
 * ✅ Singleton initialization (safe to call multiple times)
 */
import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// === Plugin Interface ===
interface LiveKitNativePlugin {
  initialize(): Promise<{ success: boolean; message: string }>;
  connect(options: { wsUrl: string; token: string }): Promise<{
    connected: boolean;
    roomName: string;
    participantCount: number;
  }>;
  setVideoVisible(options: { visible: boolean }): Promise<void>;
  setMirror(options: { mirror: boolean }): Promise<void>;
  setScalingType(options: { type: 'FIT' | 'FILL' | 'BALANCED' }): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<{
    hasRenderer: boolean;
    isVideoVisible: boolean;
    remoteParticipants: number;
  }>;
  addListener(eventName: string, handler: (data: any) => void): Promise<PluginListenerHandle>;
}

// Register native plugin
const LiveKitNative = registerPlugin<LiveKitNativePlugin>('LiveKitNative');

// === State tracking ===
let _initialized = false;
let _connected = false;

/**
 * Check if native LiveKit is available on this platform
 */
export function isNativeLiveKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Initialize native video surface (idempotent — safe to call multiple times)
 */
export async function initNativeVideoSurface(): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) {
    console.log('[LiveKitBridge] Web platform — using WebView fallback');
    return false;
  }

  if (_initialized) {
    console.log('[LiveKitBridge] Already initialized');
    return true;
  }

  try {
    const result = await LiveKitNative.initialize();
    _initialized = result.success;
    console.log('[LiveKitBridge] ✅ Native surface:', result.message);
    return result.success;
  } catch (error) {
    console.warn('[LiveKitBridge] Native init failed:', error);
    _initialized = false;
    return false;
  }
}

/**
 * Connect to LiveKit room with native GPU video rendering
 */
export async function connectNativeLiveKit(wsUrl: string, token: string): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;

  // Auto-initialize if not done
  if (!_initialized) {
    const ok = await initNativeVideoSurface();
    if (!ok) return false;
  }

  try {
    const result = await LiveKitNative.connect({ wsUrl, token });
    _connected = result.connected;
    console.log('[LiveKitBridge] ✅ Connected:', result.roomName, 'participants:', result.participantCount);
    return result.connected;
  } catch (error) {
    console.error('[LiveKitBridge] Connect failed:', error);
    _connected = false;
    return false;
  }
}

/**
 * Show/hide native video surface (use when entering/leaving live stream)
 */
export async function setNativeVideoVisible(visible: boolean): Promise<void> {
  if (!isNativeLiveKitAvailable() || !_initialized) return;

  try {
    await LiveKitNative.setVideoVisible({ visible });
  } catch (error) {
    console.warn('[LiveKitBridge] setVideoVisible failed:', error);
  }
}

/**
 * Set mirror mode (for host viewing their own camera)
 */
export async function setNativeVideoMirror(mirror: boolean): Promise<void> {
  if (!isNativeLiveKitAvailable() || !_initialized) return;

  try {
    await LiveKitNative.setMirror({ mirror });
  } catch {}
}

/**
 * Set video scaling type
 */
export async function setNativeVideoScaling(type: 'FIT' | 'FILL' | 'BALANCED'): Promise<void> {
  if (!isNativeLiveKitAvailable() || !_initialized) return;

  try {
    await LiveKitNative.setScalingType({ type });
  } catch {}
}

/**
 * Disconnect native LiveKit
 */
export async function disconnectNativeLiveKit(): Promise<void> {
  if (!isNativeLiveKitAvailable()) return;

  try {
    await LiveKitNative.disconnect();
    _connected = false;
  } catch (error) {
    console.warn('[LiveKitBridge] disconnect error:', error);
  }
}

/**
 * Get native connection status
 */
export async function getNativeLiveKitStatus() {
  if (!isNativeLiveKitAvailable()) return null;

  try {
    return await LiveKitNative.getStatus();
  } catch {
    return null;
  }
}

/**
 * Check if currently connected via native
 */
export function isNativeConnected(): boolean {
  return _connected;
}

// === Event Listeners ===

type NativeEventCallback = (data: any) => void;

/**
 * Listen for native video track attached event
 */
export async function onNativeVideoAttached(callback: NativeEventCallback): Promise<PluginListenerHandle | null> {
  if (!isNativeLiveKitAvailable()) return null;
  return LiveKitNative.addListener('nativeVideoAttached', callback);
}

/**
 * Listen for native video track detached event
 */
export async function onNativeVideoDetached(callback: NativeEventCallback): Promise<PluginListenerHandle | null> {
  if (!isNativeLiveKitAvailable()) return null;
  return LiveKitNative.addListener('nativeVideoDetached', callback);
}

/**
 * Listen for native disconnect event
 */
export async function onNativeDisconnected(callback: NativeEventCallback): Promise<PluginListenerHandle | null> {
  if (!isNativeLiveKitAvailable()) return null;
  return LiveKitNative.addListener('nativeDisconnected', callback);
}

/**
 * Listen for reconnecting event
 */
export async function onNativeReconnecting(callback: NativeEventCallback): Promise<PluginListenerHandle | null> {
  if (!isNativeLiveKitAvailable()) return null;
  return LiveKitNative.addListener('nativeReconnecting', callback);
}

export { LiveKitNative };
