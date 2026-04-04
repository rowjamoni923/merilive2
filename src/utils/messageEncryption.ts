/**
 * Message Encryption Utility (AES-256-GCM)
 * 
 * Provides end-to-end encryption for chat messages and sensitive data.
 * Uses Web Crypto API for secure AES-256-GCM encryption.
 * 
 * Flow:
 * 1. Each conversation gets a unique encryption key
 * 2. Messages are encrypted before sending to database
 * 3. Messages are decrypted on the client when displayed
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM
const ENCRYPTION_PREFIX = 'ENC::';
const KEY_STORAGE_PREFIX = 'meri_ek_';

/**
 * Generate a new AES-256 encryption key
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable for export/storage
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a CryptoKey to a base64 string for storage
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(raw);
}

/**
 * Import a base64 string back to a CryptoKey
 */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message string using AES-256-GCM
 * Returns a prefixed string: "ENC::<iv>:<ciphertext>" in base64
 */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate random IV for each message
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    const ivBase64 = arrayBufferToBase64(iv.buffer);
    const ctBase64 = arrayBufferToBase64(ciphertext);
    
    return `${ENCRYPTION_PREFIX}${ivBase64}:${ctBase64}`;
  } catch (error) {
    console.error('[Encryption] Failed to encrypt:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt an encrypted message string
 */
export async function decryptMessage(
  encryptedStr: string,
  key: CryptoKey
): Promise<string> {
  try {
    if (!isEncrypted(encryptedStr)) {
      return encryptedStr; // Return as-is if not encrypted
    }

    const payload = encryptedStr.slice(ENCRYPTION_PREFIX.length);
    const [ivBase64, ctBase64] = payload.split(':');
    
    if (!ivBase64 || !ctBase64) {
      throw new Error('Invalid encrypted format');
    }

    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const ciphertext = base64ToArrayBuffer(ctBase64);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('[Encryption] Failed to decrypt:', error);
    return '[🔒 Encrypted message - Unable to decrypt]';
  }
}

/**
 * Check if a message string is encrypted
 */
export function isEncrypted(text: string): boolean {
  return text?.startsWith(ENCRYPTION_PREFIX) ?? false;
}

/**
 * Get or create an encryption key for a conversation
 * Keys are stored locally per conversation
 */
export async function getConversationKey(conversationId: string): Promise<CryptoKey> {
  const storageKey = `${KEY_STORAGE_PREFIX}${conversationId}`;
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return await importKey(stored);
    }
  } catch {
    // Key corrupted, generate new one
  }

  const key = await generateEncryptionKey();
  const exported = await exportKey(key);
  localStorage.setItem(storageKey, exported);
  return key;
}

/**
 * Batch decrypt multiple messages
 */
export async function decryptMessages(
  messages: Array<{ id: string; content: string; [key: string]: any }>,
  key: CryptoKey
): Promise<Array<{ id: string; content: string; [key: string]: any }>> {
  return Promise.all(
    messages.map(async (msg) => ({
      ...msg,
      content: await decryptMessage(msg.content, key),
    }))
  );
}

// --- Helpers ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encryption hook helper - provides encrypt/decrypt for a conversation
 */
export function createConversationEncryptor(conversationId: string) {
  let keyPromise: Promise<CryptoKey> | null = null;

  const getKey = () => {
    if (!keyPromise) {
      keyPromise = getConversationKey(conversationId);
    }
    return keyPromise;
  };

  return {
    encrypt: async (plaintext: string): Promise<string> => {
      const key = await getKey();
      return encryptMessage(plaintext, key);
    },
    decrypt: async (ciphertext: string): Promise<string> => {
      const key = await getKey();
      return decryptMessage(ciphertext, key);
    },
    isEncrypted,
  };
}
