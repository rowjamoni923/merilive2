/**
 * useMessageEncryption Hook
 * 
 * Provides easy-to-use encryption/decryption for chat messages.
 * Automatically manages per-conversation encryption keys.
 * 
 * Usage:
 * const { encrypt, decrypt, decryptBatch } = useMessageEncryption(conversationId);
 * const encrypted = await encrypt("Hello!");
 * const plain = await decrypt(encrypted);
 */

import { useCallback, useRef } from 'react';
import {
  encryptMessage,
  decryptMessage,
  decryptMessages,
  getConversationKey,
  isEncrypted,
} from '@/utils/messageEncryption';

export function useMessageEncryption(conversationId: string | null) {
  const keyRef = useRef<CryptoKey | null>(null);
  const keyPromiseRef = useRef<Promise<CryptoKey> | null>(null);

  const getKey = useCallback(async (): Promise<CryptoKey | null> => {
    if (!conversationId) return null;
    
    if (keyRef.current) return keyRef.current;
    
    if (!keyPromiseRef.current) {
      keyPromiseRef.current = getConversationKey(conversationId).then((k) => {
        keyRef.current = k;
        return k;
      });
    }
    
    return keyPromiseRef.current;
  }, [conversationId]);

  const encrypt = useCallback(async (plaintext: string): Promise<string> => {
    const key = await getKey();
    if (!key) return plaintext;
    
    try {
      return await encryptMessage(plaintext, key);
    } catch {
      console.warn('[useMessageEncryption] Encryption failed, sending plain');
      return plaintext;
    }
  }, [getKey]);

  const decrypt = useCallback(async (ciphertext: string): Promise<string> => {
    if (!isEncrypted(ciphertext)) return ciphertext;
    
    const key = await getKey();
    if (!key) return ciphertext;
    
    return decryptMessage(ciphertext, key);
  }, [getKey]);

  const decryptBatch = useCallback(async (
    messages: Array<{ id: string; content: string; [key: string]: any }>
  ) => {
    const key = await getKey();
    if (!key) return messages;
    
    return decryptMessages(messages, key);
  }, [getKey]);

  return {
    encrypt,
    decrypt,
    decryptBatch,
    isEncrypted,
  };
}
