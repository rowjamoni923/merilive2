import { registerPlugin } from '@capacitor/core';

export interface NativeBillingSecurityPlugin {
  verifyPurchaseSecurity(options: { 
    purchaseToken: string; 
    productId: string; 
  }): Promise<{
    isValidSignature: boolean;
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