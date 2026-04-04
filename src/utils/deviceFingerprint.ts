/**
 * Device Fingerprinting Utility
 * 
 * Generates a unique fingerprint for the current device/browser.
 * Used for admin panel device-based access control.
 * 
 * This combines multiple browser characteristics to create a reasonably
 * unique identifier that persists across sessions.
 */

interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  details: {
    userAgent: string;
    platform: string;
    language: string;
    screenResolution: string;
    timezone: string;
    colorDepth: number;
    touchSupport: boolean;
    cookiesEnabled: boolean;
    webglVendor: string;
    webglRenderer: string;
  };
}

/**
 * Generate a hash from a string using a simple but effective algorithm
 */
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and ensure positive
  return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * Get WebGL renderer info
 */
const getWebGLInfo = (): { vendor: string; renderer: string } => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown'
        };
      }
    }
  } catch (e) {
    console.log('[DeviceFingerprint] WebGL not available');
  }
  return { vendor: 'unknown', renderer: 'unknown' };
};

/**
 * Get canvas fingerprint
 */
const getCanvasFingerprint = (): string => {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    
    // Draw some text and shapes
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('MeriLive Admin', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Device FP', 4, 17);
    
    return hashString(canvas.toDataURL());
  } catch (e) {
    return 'canvas-error';
  }
};

/**
 * Generate device name from user agent
 */
const generateDeviceName = (): string => {
  const ua = navigator.userAgent;
  
  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  
  // Detect Browser
  let browser = 'Unknown Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';
  else if (ua.includes('Opera')) browser = 'Opera';
  
  return `${browser} on ${os}`;
};

/**
 * Generate a unique device fingerprint
 */
export const generateDeviceFingerprint = (): DeviceInfo => {
  const webglInfo = getWebGLInfo();
  const canvasHash = getCanvasFingerprint();
  
  const details = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    colorDepth: screen.colorDepth,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    cookiesEnabled: navigator.cookieEnabled,
    webglVendor: webglInfo.vendor,
    webglRenderer: webglInfo.renderer
  };
  
  // Combine all characteristics into a fingerprint string
  const fingerprintData = [
    details.platform,
    details.language,
    details.screenResolution,
    details.timezone,
    details.colorDepth.toString(),
    details.touchSupport.toString(),
    webglInfo.vendor,
    webglInfo.renderer,
    canvasHash
  ].join('|');
  
  // Generate hash
  const fingerprint = 'DEV-' + hashString(fingerprintData).toUpperCase() + 
                      '-' + hashString(details.userAgent.substring(0, 50)).toUpperCase();
  
  return {
    fingerprint,
    deviceName: generateDeviceName(),
    details
  };
};

/**
 * Get stored fingerprint or generate new one
 * Fingerprint is stored in localStorage for consistency
 */
export const getDeviceFingerprint = (): DeviceInfo => {
  const STORAGE_KEY = 'meri_admin_device_fp';
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Verify it's still valid (same basic characteristics)
      const current = generateDeviceFingerprint();
      
      // If major characteristics match, use stored fingerprint
      if (parsed.details?.screenResolution === current.details.screenResolution &&
          parsed.details?.platform === current.details.platform) {
        // Update device name in case browser updated
        parsed.deviceName = current.deviceName;
        return parsed;
      }
    }
  } catch (e) {
    console.log('[DeviceFingerprint] Error reading stored fingerprint');
  }
  
  // Generate new fingerprint
  const newFingerprint = generateDeviceFingerprint();
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newFingerprint));
  } catch (e) {
    console.log('[DeviceFingerprint] Error storing fingerprint');
  }
  
  return newFingerprint;
};

/**
 * Clear stored fingerprint (for testing)
 */
export const clearDeviceFingerprint = (): void => {
  localStorage.removeItem('meri_admin_device_fp');
};

export default getDeviceFingerprint;
