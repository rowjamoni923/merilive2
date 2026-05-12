/**
 * Play Store Billing SDK
 * Handles Google Play In-App Purchases for coin/diamond packages
 * 
 * Uses Capacitor registerPlugin() for proper native bridge communication
 * Purchase verification is done SERVER-SIDE via Edge Function
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// Plugin Interface & Registration
// ============================================

interface PlayStoreBillingPlugin {
  initialize(): Promise<{ success: boolean }>;
  getProducts(options: { productIds: string[] }): Promise<{ products: PlayStoreProduct[] }>;
  purchase(options: { productId: string; userId?: string }): Promise<{ 
    success: boolean; 
    orderId?: string; 
    purchaseToken?: string; 
    productId?: string;
    error?: string;
  }>;
  restorePurchases(): Promise<{ purchases: any[] }>;
}

const PlayStoreBillingBridge = registerPlugin<PlayStoreBillingPlugin>('PlayStoreBilling');

// ============================================
// Types
// ============================================

export interface PlayStoreProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
}

interface AdminPlayStoreProductRow {
  coins_amount: number | null;
  bonus_coins: number | null;
  price_usd: number | string | null;
  product_id: string | null;
  is_active: boolean | null;
}

export interface PurchaseResult {
  success: boolean;
  orderId?: string;
  purchaseToken?: string;
  productId?: string;
  error?: string;
}

// ============================================
// Play Store Product Mapping
// ============================================
// Source of truth = `coin_packages` table (admin-editable).
// The values below mirror the current DB rows so synchronous callers
// (components reading PLAY_STORE_PRODUCTS directly) get correct data
// even before loadPlayStoreProducts() finishes its async DB fetch.
// loadPlayStoreProducts() refreshes this map at app start.

export const PLAY_STORE_PRODUCTS: Record<number, { productId: string; priceUsd: number }> = {
  7000:   { productId: 'diamonds_7000',   priceUsd: 1.29 },
  13200:  { productId: 'diamonds_13200',  priceUsd: 2.49 },
  56000:  { productId: 'diamonds_56000',  priceUsd: 9.99 },
  169000: { productId: 'diamonds_169000', priceUsd: 30.99 },
  470000: { productId: 'diamonds_470000', priceUsd: 72.99 },
  650000: { productId: 'diamonds_650000', priceUsd: 89.99 },
};

export let ALL_PRODUCT_IDS: string[] = Object.values(PLAY_STORE_PRODUCTS).map(p => p.productId);

/**
 * Refresh PLAY_STORE_PRODUCTS from the `coin_packages` DB table so
 * admin price/product changes propagate without a code release.
 * Call once at app start (after Supabase client is ready). Safe to fail —
 * the hardcoded fallback above keeps the app working offline.
 */
export async function loadPlayStoreProducts(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('coin_packages')
      .select('coins_amount, bonus_coins, price_usd, product_id, is_active')
      .eq('is_active', true);
    if (error || !data?.length) return;

    const next: Record<number, { productId: string; priceUsd: number }> = {};
    for (const row of data as AdminPlayStoreProductRow[]) {
      const baseCoins = Number(row.coins_amount || 0);
      const bonusCoins = Number(row.bonus_coins || 0);
      const totalCoins = baseCoins + bonusCoins;
      const productId = String(row.product_id || '').trim();
      if (!baseCoins || !productId || row.price_usd == null) continue;

      const product = {
        productId,
        priceUsd: Number(row.price_usd),
      };

      // Support both old UI lookups by base diamonds and new UI lookups by
      // total delivered diamonds (base + bonus) without breaking admin edits.
      next[baseCoins] = product;
      if (totalCoins !== baseCoins) next[totalCoins] = product;
    }
    if (Object.keys(next).length === 0) return;

    // Mutate the exported map in place so existing imports stay valid.
    for (const k of Object.keys(PLAY_STORE_PRODUCTS)) {
      delete PLAY_STORE_PRODUCTS[Number(k)];
    }
    Object.assign(PLAY_STORE_PRODUCTS, next);
    ALL_PRODUCT_IDS = Object.values(PLAY_STORE_PRODUCTS).map((p) => p.productId);
    console.log('[PlayStoreBilling] Loaded', ALL_PRODUCT_IDS.length, 'packages from DB');
  } catch (e) {
    console.warn('[PlayStoreBilling] loadPlayStoreProducts failed (using fallback):', e);
  }
}

// ============================================
// SDK Class
// ============================================

class PlayStoreBillingSDK {
  private isNative: boolean;
  private isInitialized: boolean = false;
  private lastError: string = '';

  constructor() {
    this.isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    console.log('[PlayStoreBilling] Platform:', { isNative: this.isNative, platform: Capacitor.getPlatform() });
  }

  isAvailable(): boolean {
    return this.isNative;
  }

  getLastError(): string {
    return this.lastError;
  }

  async initialize(): Promise<boolean> {
    if (!this.isNative) {
      this.lastError = 'Not Android platform';
      return false;
    }
    try {
      const result = await PlayStoreBillingBridge.initialize();
      this.isInitialized = result?.success || false;
      if (!this.isInitialized) this.lastError = 'BillingClient returned false';
      return this.isInitialized;
    } catch (error: any) {
      this.lastError = error?.message || 'Unknown initialize error';
      console.error('[PlayStoreBilling] Initialize error:', this.lastError);
      return false;
    }
  }

  async getProducts(productIds: string[]): Promise<PlayStoreProduct[]> {
    if (!this.isNative || !this.isInitialized) return [];
    try {
      const result = await PlayStoreBillingBridge.getProducts({ productIds });
      return result?.products || [];
    } catch (error) {
      console.error('[PlayStoreBilling] getProducts error:', error);
      return [];
    }
  }

  async purchase(productId: string, userId: string): Promise<PurchaseResult> {
    if (!this.isNative) {
      return { success: false, error: 'Play Store Billing is only available on Android' };
    }
    try {
      console.log('[PlayStoreBilling] Starting purchase:', productId);
      const result = await PlayStoreBillingBridge.purchase({ productId, userId });

      if (result?.success && result?.purchaseToken) {
        const verifyResult = await this.verifyPurchase(
          result.purchaseToken, productId, userId, result.orderId
        );
        if (verifyResult.success) {
          return { success: true, orderId: result.orderId, purchaseToken: result.purchaseToken, productId };
        }
        return { success: false, error: verifyResult.error || 'Verification failed' };
      }
      return { success: false, error: result?.error || 'Purchase failed' };
    } catch (error: any) {
      console.error('[PlayStoreBilling] Purchase error:', error);
      return { success: false, error: error.message || 'Unknown purchase error' };
    }
  }

  /**
   * Server-side purchase verification via Edge Function
   * Google Play Developer API validates the purchase token
   */
  private async verifyPurchase(
    purchaseToken: string, productId: string, userId: string, orderId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[PlayStoreBilling] 🔐 Server-side verification...');

      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
        if (!session?.access_token) {
          return { success: false, error: 'No auth session for verification' };
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-google-purchase`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            productId,
            purchaseToken,
            orderId: orderId || purchaseToken.substring(0, 40),
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error('[PlayStoreBilling] ❌ Server verification failed:', result.error);
        return { success: false, error: result.error || 'Server verification failed' };
      }

      console.log('[PlayStoreBilling] ✅ Verified! Coins:', result.coins, 'Balance:', result.newBalance);

      if (result.newBalance !== undefined) {
        const { updateCachedBalance } = await import('@/hooks/useUserBalance');
        updateCachedBalance(result.newBalance);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[PlayStoreBilling] Verification error:', error);
      return { success: false, error: error.message || 'Verification failed' };
    }
  }

  async restorePurchases(userId: string): Promise<PurchaseResult[]> {
    if (!this.isNative || !this.isInitialized) return [];
    try {
      const result = await PlayStoreBillingBridge.restorePurchases();
      const purchases = result?.purchases || [];
      
      // Auto-verify any unconsumed purchases (these are "paid but not delivered")
      const results: PurchaseResult[] = [];
      for (const p of purchases) {
        if (p.purchaseToken && p.productId) {
          console.log('[PlayStoreBilling] 🔄 Retrying undelivered purchase:', p.productId);
          const verifyResult = await this.verifyPurchase(
            p.purchaseToken, p.productId, userId, p.orderId
          );
          results.push({
            success: verifyResult.success,
            orderId: p.orderId,
            purchaseToken: p.purchaseToken,
            productId: p.productId,
            error: verifyResult.error,
          });
        }
      }
      return results;
    } catch (error) {
      console.error('[PlayStoreBilling] Restore error:', error);
      return [];
    }
  }

  /**
   * Auto-retry pending purchases on app launch
   * Call this after initialize() succeeds
   */
  async retryPendingPurchases(userId: string): Promise<number> {
    if (!this.isNative || !this.isInitialized) return 0;
    try {
      console.log('[PlayStoreBilling] 🔍 Checking for pending/undelivered purchases...');
      const results = await this.restorePurchases(userId);
      const recovered = results.filter(r => r.success).length;
      if (recovered > 0) {
        console.log(`[PlayStoreBilling] ✅ Recovered ${recovered} pending purchase(s)!`);
      } else {
        console.log('[PlayStoreBilling] No pending purchases found.');
      }
      return recovered;
    } catch (error) {
      console.error('[PlayStoreBilling] retryPendingPurchases error:', error);
      return 0;
    }
  }

  getProductIdForCoins(coins: number): string | null {
    const product = PLAY_STORE_PRODUCTS[coins];
    if (product) return product.productId;
    console.warn(`[PlayStoreBilling] No product for ${coins} coins`);
    return null;
  }
}

export const playStoreBilling = new PlayStoreBillingSDK();
export default playStoreBilling;
