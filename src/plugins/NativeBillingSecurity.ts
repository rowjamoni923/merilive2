import { registerPlugin } from '@capacitor/core';

export interface NativeBillingSecurityPlugin {
  /** Register the Play Store licensing public key (Base64) once at app boot. */
  setPublicKey(options: { publicKey: string }): Promise<{ stored: boolean }>;

  verifyPurchaseSecurity(options: {
    purchaseToken: string;
    productId: string;
    /** Required for real SHA1withRSA validation — pass purchase.originalJson + purchase.signature from Play Billing. */
    originalJson?: string;
    signature?: string;
  }): Promise<{
    isValidSignature: boolean;
    reason?: string;
    deviceFingerprint: string;
    isLikelyFraud: boolean;
  }>;
  getEnhancedSecurityToken(options: {
    orderId: string;
  }): Promise<{
    securityToken: string;
  }>;
}

const NativeBillingSecurity = registerPlugin<NativeBillingSecurityPlugin>('NativeBillingSecurity');

export default NativeBillingSecurity;
