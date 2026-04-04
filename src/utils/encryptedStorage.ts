/**
 * 🔐 ENCRYPTED LOCAL STORAGE
 * 
 * AES-GCM encryption wrapper for localStorage.
 * Automatically encrypts/decrypts sensitive data keys.
 * Non-sensitive keys pass through normally for performance.
 * 
 * Uses Web Crypto API (native browser, no dependencies).
 */

// Keys that contain sensitive data and MUST be encrypted
const SENSITIVE_KEYS = [
  'meri_device_account',    // Contains email + password
  'meri_device_id',         // Device fingerprint
  'meri_last_user',         // User email & display info
  'meri_pending_registration', // Registration data
  'meri_return_to',         // Return URL (potential redirect attack)
  'meri_pending_agency_claim', // Agency claim data
  'meri_session_fingerprint',  // Session security fingerprint
  // ❌ NEVER encrypt Supabase auth token — SDK reads it directly from localStorage
  // Encrypting it causes getSession() to return null → user gets logged out
];

// Device-derived encryption key (deterministic per device)
let cryptoKey: CryptoKey | null = null;
let keyReady = false;

/**
 * Generate a deterministic encryption key from device characteristics.
 * This ensures data encrypted on one device can't be decrypted on another.
 */
const getDeviceFingerprint = (): string => {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    screen.colorDepth.toString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    'meri_secure_v1', // Salt
  ];
  return parts.join('|');
};

/**
 * Derive an AES-GCM key from the device fingerprint
 */
const deriveKey = async (): Promise<CryptoKey> => {
  if (cryptoKey) return cryptoKey;

  const fingerprint = getDeviceFingerprint();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(fingerprint),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('MeriLive_Encrypted_Storage_v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  keyReady = true;
  return cryptoKey;
};

/**
 * Encrypt a string value using AES-GCM
 */
const encrypt = async (plaintext: string): Promise<string> => {
  try {
    const key = await deriveKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return '🔐' + btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('[EncryptedStorage] Encryption failed:', err);
    return plaintext; // Fallback to plaintext if crypto fails
  }
};

/**
 * Decrypt a string value using AES-GCM
 */
const decrypt = async (ciphertext: string): Promise<string> => {
  // If not encrypted (no prefix), return as-is
  if (!ciphertext.startsWith('🔐')) return ciphertext;

  try {
    const key = await deriveKey();
    const raw = ciphertext.slice(2); // Remove prefix
    const combined = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[EncryptedStorage] Decryption failed, clearing corrupted data');
    return ''; // Return empty if decryption fails
  }
};

/**
 * Check if a key should be encrypted
 */
const isSensitiveKey = (key: string): boolean => {
  return SENSITIVE_KEYS.some(sk => key === sk || key.startsWith(sk));
};

/**
 * Encrypted localStorage wrapper
 */
export const secureStorage = {
  /**
   * Set an item (auto-encrypts sensitive keys)
   */
  setItem: async (key: string, value: string): Promise<void> => {
    if (isSensitiveKey(key)) {
      const encrypted = await encrypt(value);
      localStorage.setItem(key, encrypted);
    } else {
      localStorage.setItem(key, value);
    }
  },

  /**
   * Get an item (auto-decrypts sensitive keys)
   */
  getItem: async (key: string): Promise<string | null> => {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    
    if (isSensitiveKey(key) || value.startsWith('🔐')) {
      const decrypted = await decrypt(value);
      return decrypted || null;
    }
    return value;
  },

  /**
   * Remove an item
   */
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
  },

  /**
   * Synchronous getItem for non-critical reads (returns raw/encrypted)
   * Use only when async is not possible
   */
  getItemSync: (key: string): string | null => {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    // If encrypted, return null (must use async version)
    if (value.startsWith('🔐')) return null;
    return value;
  },

  /**
   * Migrate existing plaintext sensitive data to encrypted format
   * Call once on app startup
   */
  migrateToEncrypted: async (): Promise<void> => {
    try {
      // 🛡️ CRITICAL: If Supabase auth token was previously encrypted, RESTORE it
      const supabaseKey = 'sb-pppcwawjjpwwrmvezcdy-auth-token';
      const supabaseValue = localStorage.getItem(supabaseKey);
      if (supabaseValue && supabaseValue.startsWith('🔐')) {
        console.warn('[EncryptedStorage] ⚠️ Supabase auth token was encrypted! Restoring...');
        try {
          const restored = await decrypt(supabaseValue);
          if (restored) {
            localStorage.setItem(supabaseKey, restored);
            console.log('[EncryptedStorage] ✅ Supabase auth token restored to plaintext');
          } else {
            // Can't decrypt — remove corrupted token, user will need to re-login once
            localStorage.removeItem(supabaseKey);
            console.warn('[EncryptedStorage] ❌ Could not decrypt auth token — removed corrupted data');
          }
        } catch {
          localStorage.removeItem(supabaseKey);
        }
      }

      for (const key of SENSITIVE_KEYS) {
        const value = localStorage.getItem(key);
        if (value && !value.startsWith('🔐')) {
          // Plaintext data found - encrypt it
          const encrypted = await encrypt(value);
          localStorage.setItem(key, encrypted);
          console.log(`[EncryptedStorage] Migrated: ${key}`);
        }
      }
      console.log('[EncryptedStorage] ✅ Migration complete');
    } catch (err) {
      console.error('[EncryptedStorage] Migration error:', err);
    }
  },

  /**
   * Check if encryption is available
   */
  isAvailable: (): boolean => {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }
};

export default secureStorage;
