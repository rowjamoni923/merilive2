/**
 * Play Store Billing SDK
 * Handles Google Play In-App Purchases for coin/diamond packages
 * 
 * Uses Capacitor registerPlugin() for proper native bridge communication
 * Purchase verification is done SERVER-SIDE via Edge Function
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
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

interface PlayStoreProductConfig {
  productId: string;
  priceUsd: number;
  aliases: string[];
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

const uniqueIds = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));

const makeProductConfig = (baseCoins: number, bonusCoins: number, productId: string, priceUsd: number): PlayStoreProductConfig => {
  const totalCoins = baseCoins + bonusCoins;
  return {
    productId,
    priceUsd,
    aliases: uniqueIds([
      productId,
      `diamonds_${baseCoins}`,
      `coins_${baseCoins}`,
      `diamonds_${totalCoins}`,
      `coins_${totalCoins}`,
    ]),
  };
};

export const PLAY_STORE_PRODUCTS: Record<number, PlayStoreProductConfig> = {
  7000:   makeProductConfig(7000, 3500, 'diamonds_7000', 1.29),
  13200:  makeProductConfig(13200, 1320, 'diamonds_13200', 2.49),
  56000:  makeProductConfig(56000, 42000, 'diamonds_56000', 9.99),
  169000: makeProductConfig(169000, 42250, 'diamonds_169000', 30.99),
  470000: makeProductConfig(470000, 352500, 'diamonds_470000', 72.99),
  650000: makeProductConfig(650000, 487500, 'diamonds_650000', 89.99),
};

export let ALL_PRODUCT_IDS: string[] = uniqueIds(Object.values(PLAY_STORE_PRODUCTS).flatMap(p => p.aliases));

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

    const next: Record<number, PlayStoreProductConfig> = {};
    for (const row of data as AdminPlayStoreProductRow[]) {
      const baseCoins = Number(row.coins_amount || 0);
      const bonusCoins = Number(row.bonus_coins || 0);
      const totalCoins = baseCoins + bonusCoins;
      const productId = String(row.product_id || '').trim();
      if (!baseCoins || !productId || row.price_usd == null) continue;

      const product = makeProductConfig(baseCoins, bonusCoins, productId, Number(row.price_usd));

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
    ALL_PRODUCT_IDS = uniqueIds(Object.values(PLAY_STORE_PRODUCTS).flatMap((p) => p.aliases));
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
  private initPromise: Promise<boolean> | null = null;
  private productDetailsCache: PlayStoreProduct[] = [];

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
    if (this.isInitialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initializeBridge().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async initializeBridge(): Promise<boolean> {
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

  private isReconnectError(error: any): boolean {
    const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return text.includes('not_connected') || text.includes('service_disconnected') || text.includes('reconnecting');
  }

  async getProducts(productIds: string[]): Promise<PlayStoreProduct[]> {
    if (!this.isNative) return [];
    if (!this.isInitialized && !(await this.initialize())) return [];
    try {
      const result = await PlayStoreBillingBridge.getProducts({ productIds });
      const products = result?.products || [];
      this.productDetailsCache = products;
      return products;
    } catch (error: any) {
      if (this.isReconnectError(error)) {
        this.isInitialized = false;
        if (await this.initialize()) {
          const retry = await PlayStoreBillingBridge.getProducts({ productIds });
          const products = retry?.products || [];
          this.productDetailsCache = products;
          return products;
        }
      }
      this.lastError = error?.message || 'Could not load Play Store products';
      console.error('[PlayStoreBilling] getProducts error:', error);
      return [];
    }
  }

  private async resolveAvailableProductId(product: PlayStoreProductConfig): Promise<string | null> {
    const candidates = uniqueIds([product.productId, ...product.aliases]);
    const cached = this.productDetailsCache.find((p) => candidates.includes(p.productId));
    if (cached) return cached.productId;

    const products = await this.getProducts(candidates);
    return products.find((p) => candidates.includes(p.productId))?.productId || null;
  }

  private async purchaseWithReconnect(productId: string, userId: string) {
    try {
      return await PlayStoreBillingBridge.purchase({ productId, userId });
    } catch (error: any) {
      if (this.isReconnectError(error)) {
        this.isInitialized = false;
        if (await this.initialize()) {
          return await PlayStoreBillingBridge.purchase({ productId, userId });
        }
      }
      throw error;
    }
  }

  async purchase(productId: string, userId: string): Promise<PurchaseResult> {
    if (!this.isNative) {
      return { success: false, error: 'Play Store Billing is only available on Android' };
    }
    try {
      if (!this.isInitialized && !(await this.initialize())) {
        return { success: false, error: this.lastError || 'Google Play Billing is not ready' };
      }
      const configuredProduct = Object.values(PLAY_STORE_PRODUCTS).find((p) => p.aliases.includes(productId) || p.productId === productId);
      const availableProductId = configuredProduct ? await this.resolveAvailableProductId(configuredProduct) : productId;
      if (!availableProductId) {
        return { success: false, error: 'This package is not active in Google Play Console yet' };
      }

      console.log('[PlayStoreBilling] Starting purchase:', availableProductId);
      const result = await this.purchaseWithReconnect(availableProductId, userId);

      if (result?.success && result?.purchaseToken) {
        const verifyResult = await this.verifyPurchase(
          result.purchaseToken, result.productId || availableProductId, userId, result.orderId
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
    if (!this.isNative) return [];
    if (!this.isInitialized && !(await this.initialize())) return [];
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
    if (!this.isNative) return 0;
    if (!this.isInitialized && !(await this.initialize())) return 0;
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
