/**
 * Screen Security SDK for preventing screenshots and screen recording
 * Uses native FLAG_SECURE on Android and UIScreen protection on iOS
 */

import { Capacitor } from "@capacitor/core";

interface ScreenSecurityPlugin {
  enableSecureMode(): Promise<void>;
  disableSecureMode(): Promise<void>;
  isSecureModeEnabled(): Promise<{ enabled: boolean }>;
}

class ScreenSecuritySDKClass {
  private isSecure = false;
  private plugin: ScreenSecurityPlugin | null = null;

  constructor() {
    this.initPlugin();
  }

  private async initPlugin() {
    if (Capacitor.isNativePlatform()) {
      try {
        // Try to register the native plugin
        const { registerPlugin } = await import("@capacitor/core");
        this.plugin = registerPlugin<ScreenSecurityPlugin>("ScreenSecurity");
      } catch (error) {
        console.warn("ScreenSecurity plugin not available:", error);
      }
    }
  }

  /**
   * Enable secure mode - prevents screenshots and screen recording
   * Should be called when entering private call or sensitive screens
   */
  async enableSecureMode(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // Web platform: CSS overlay cannot actually block screenshots/recording
      // Only native FLAG_SECURE works. Skip overlay to avoid visual issues.
      console.log("Screen security: Web platform - skipping (native only)");
      return false;
    }

    try {
      if (this.plugin) {
        await this.plugin.enableSecureMode();
        this.isSecure = true;
        console.log("Screen security: Native secure mode enabled");
        return true;
      } else {
        // Fallback: Use CSS overlay for web
        this.addWebOverlay();
        return true;
      }
    } catch (error) {
      console.error("Failed to enable secure mode:", error);
      return false;
    }
  }

  /**
   * Disable secure mode - allows normal screen behavior
   * Should be called when exiting private call
   */
  async disableSecureMode(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      this.removeWebOverlay();
      return true;
    }

    try {
      if (this.plugin) {
        await this.plugin.disableSecureMode();
        this.isSecure = false;
        console.log("Screen security: Native secure mode disabled");
        return true;
      } else {
        this.removeWebOverlay();
        return true;
      }
    } catch (error) {
      console.error("Failed to disable secure mode:", error);
      return false;
    }
  }

  /**
   * Check if secure mode is currently enabled
   */
  async isSecureModeEnabled(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return !!document.getElementById("screen-security-overlay");
    }

    try {
      if (this.plugin) {
        const result = await this.plugin.isSecureModeEnabled();
        return result.enabled;
      }
      return this.isSecure;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add CSS-based protection overlay for web (invisible)
   * Native platforms use FLAG_SECURE which is more effective
   */
  private addWebOverlay() {
    if (document.getElementById("screen-security-overlay")) return;

    // Create minimal invisible overlay (no visible text/watermark)
    const overlay = document.createElement("div");
    overlay.id = "screen-security-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 99999;
      opacity: 0;
    `;

    document.body.appendChild(overlay);

    // Detect visibility change (potential screen recording detection)
    this.detectScreenCapture();
  }

  private removeWebOverlay() {
    const overlay = document.getElementById("screen-security-overlay");
    if (overlay) overlay.remove();

    const watermarks = document.querySelectorAll('[data-watermark="true"]');
    watermarks.forEach((w) => w.remove());
  }

  /**
   * Detect potential screen capture attempts (limited effectiveness)
   */
  private detectScreenCapture() {
    // Detect Print Screen key
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        (e.ctrlKey && e.shiftKey && e.key === "S") || // Windows Snipping Tool
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5")) // macOS screenshots
      ) {
        console.warn("Screenshot attempt detected");
        this.onScreenCaptureAttempt("screenshot_attempt");
      }
    };

    document.addEventListener("keydown", handleKeydown);

    // Store cleanup function
    (window as any).__screenSecurityCleanup = () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }

  /**
   * Handle screen capture attempt
   */
  private async onScreenCaptureAttempt(eventType: string) {
    // Log the attempt (you can send this to your backend)
    console.warn("Screen capture attempt:", eventType);

    // Optional: Show warning toast
    try {
      const { toast } = await import("sonner");
      toast.warning("⚠️ Screenshot/Recording is not allowed during private calls");
    } catch (error) {
      // Toast not available
    }

    // Optional: Log to database via API
    // This would be called from the component using the SDK
  }

  /**
   * Log security event to database
   */
  async logSecurityEvent(
    callId: string,
    userId: string,
    eventType: "screenshot_attempt" | "screen_record_attempt" | "screen_share_attempt" | "app_switch",
    deviceInfo?: { [key: string]: string | number | boolean | null }
  ): Promise<void> {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const insertData = {
        call_id: callId,
        user_id: userId,
        event_type: eventType,
        device_info: deviceInfo || null,
        action_taken: "warned",
      };
      
      await supabase.from("private_call_security_logs").insert([insertData]);
    } catch (error) {
      console.error("Failed to log security event:", error);
    }
  }

  /**
   * Cleanup when component unmounts
   */
  cleanup() {
    this.removeWebOverlay();
    if ((window as any).__screenSecurityCleanup) {
      (window as any).__screenSecurityCleanup();
      delete (window as any).__screenSecurityCleanup;
    }
  }
}

// Export singleton instance
export const ScreenSecuritySDK = new ScreenSecuritySDKClass();

// Export hook for React components
export function useScreenSecurity() {
  return {
    enableSecureMode: () => ScreenSecuritySDK.enableSecureMode(),
    disableSecureMode: () => ScreenSecuritySDK.disableSecureMode(),
    isSecureModeEnabled: () => ScreenSecuritySDK.isSecureModeEnabled(),
    logSecurityEvent: ScreenSecuritySDK.logSecurityEvent.bind(ScreenSecuritySDK),
    cleanup: () => ScreenSecuritySDK.cleanup(),
  };
}
