import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, ChevronRight, Check, FileText, Diamond, Sparkles, Gem, Crown, Star, Wallet, Copy, Upload, X, Clock, Heart, RefreshCw, ShoppingCart, MessageCircle } from "lucide-react";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import firstRechargeBanner from "@/assets/first-recharge-banner.jpg";
import treasureChest3D from "@/assets/treasure-chest-3d.png";

import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useToast } from "@/hooks/use-toast";
import { useDiamondPackagesRealtime, useCurrencyRatesRealtime } from "@/hooks/useAdminSettingsRealtime";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Capacitor } from "@capacitor/core";
import playStoreBilling, { PLAY_STORE_PRODUCTS, loadPlayStoreProducts } from "@/sdk/PlayStoreBillingSDK";
import { useUserBalance, updateCachedBalance } from "@/hooks/useUserBalance";
import { recordClientError } from "@/utils/clientErrorLog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface PaymentGateway {
  id: string;
  name: string;
  gateway_code: string;
  description: string;
  logo_url: string | null;
  supported_currencies: string[];
  fee_percentage: number;
  fee_fixed: number;
  payment_number?: string;
  payment_instructions?: string;
}

type SafeNumberInput = number | string | null | undefined;

interface AcceptedMethodLogo {
  gateway_id: string;
  name: string;
  logo_url: string | null;
  is_integrated: boolean;
}

interface TopUpHelper {
  id: string;
  helperId: string;
  name: string;
  avatar: string;
  userId: string;
  appUid: string;
  isOnline: boolean;
  walletBalance: number;
  traderLevel: number;
  countryCode: string;
  countryFlag: string;
  countryName: string;
  totalSold: number;
  whatsappNumber: string | null;
  acceptedMethods: AcceptedMethodLogo[];
}

interface Level5HelperPaymentMethod {
  id: string;
  helper_id: string;
  country_code: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
  logo_url?: string | null;
  merchant_number?: string | null;
  is_merchant?: boolean;
  additional_info?: any;
  helper?: {
    id: string;
    user_id: string;
    wallet_balance: number;
    agency_diamond_balance?: number;
    user?: {
      display_name: string;
      avatar_url: string;
      app_uid: string;
    };
  };
}

type TabType = "google" | "recommend" | "helper";
type PaymentStep = "select" | "form" | "processing" | "pending";
type LocalRoute = "auto" | "manual";

const LOCAL_ROUTE_STORAGE_KEY = "recharge_next_local_route_v1";
const LAST_METHOD_STORAGE_KEY = "recharge_last_method_by_type_v1";

const PAYMENT_BRAND_FALLBACKS: Record<string, string> = {
  bkash: "bK",
  nagad: "N",
  rocket: "R",
  upay: "U",
};

const Recharge = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Support campaign deep-link: /recharge?campaign_id=xxx&tab=google|recommend|skrill
  const urlParams = new URLSearchParams(window.location.search);
  const campaignTab = urlParams.get('tab') as TabType | null;
  const campaignId = urlParams.get('campaign_id');
  
  const [selectedTab, setSelectedTab] = useState<TabType>(campaignTab && ['google', 'recommend'].includes(campaignTab) ? campaignTab : "google");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  // Use global shared balance hook for real-time sync across all pages
  const { balance: globalBalance, refetch: refetchGlobalBalance } = useUserBalance();
  const [localBalanceOverride, setLocalBalanceOverride] = useState<number | null>(null);
  const currentBalance = localBalanceOverride ?? globalBalance;
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [topUpHelpers, setTopUpHelpers] = useState<TopUpHelper[]>([]);
  const helperRotationPage = 0;
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAppUid, setUserAppUid] = useState<string | null>(null);
  const [isFirstRecharge, setIsFirstRecharge] = useState(false);
  const [firstRechargeBonus, setFirstRechargeBonus] = useState<number>(2.0);
  const [rechargeBannerConfig, setRechargeBannerConfig] = useState<{
    banner_image_url?: string | null;
    banner_title?: string | null;
    banner_subtitle?: string | null;
    banner_type?: string | null;
  }>({});
  
  // Level 5 Helper Payment Methods State
  const [helperPaymentMethods, setHelperPaymentMethods] = useState<Level5HelperPaymentMethod[]>([]);
  const [adminPaymentMethods, setAdminPaymentMethods] = useState<any[]>([]); // Admin-configured topup_payment_methods
  const [selectedHelperMethod, setSelectedHelperMethod] = useState<Level5HelperPaymentMethod | null>(null);
  const [showHelperPaymentModal, setShowHelperPaymentModal] = useState(false);
  const [helperPaymentProcessing, setHelperPaymentProcessing] = useState(false);
  const [helperTransactionId, setHelperTransactionId] = useState("");
  const [helperMessage, setHelperMessage] = useState("");
  const [helperPaymentProof, setHelperPaymentProof] = useState<string | null>(null);
  const [uploadingHelperProof, setUploadingHelperProof] = useState(false);
  const [helperPaymentStep, setHelperPaymentStep] = useState<PaymentStep>("select");
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string | null>(null); // bkash, nagad, etc.
  // Keep deterministic alternation so auto/manual usage stays balanced across refreshes too
  const [nextLocalRoute, setNextLocalRoute] = useState<LocalRoute>(() => {
    if (typeof window === "undefined") return "auto";
    const saved = localStorage.getItem(LOCAL_ROUTE_STORAGE_KEY);
    if (saved === "auto" || saved === "manual") return saved;
    return Math.random() < 0.5 ? "auto" : "manual";
  });
  const [lastSelectedMethodByType, setLastSelectedMethodByType] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(LAST_METHOD_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  // Round-robin tracker: tracks ALL used method IDs per type so every number shows before repeating
  const [usedMethodsByType, setUsedMethodsByType] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem('recharge_used_methods');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  // Play Store Billing State
  const [isPlayStoreAvailable, setIsPlayStoreAvailable] = useState(false);
  const [playStoreProcessing, setPlayStoreProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'playstore' | 'stripe' | 'local' | 'helper'>('playstore');
  const [stripeProcessing, setStripeProcessing] = useState(false);
  
  // REALTIME: Diamond Packages & Currency Rates
  const { packages, loading: packagesLoading } = useDiamondPackagesRealtime();
  const { rates, getRateForCountry, convertUsdToLocal } = useCurrencyRatesRealtime();
  
  // Real international exchange rates (for Google tab - exact market rates)
  const [internationalRates, setInternationalRates] = useState<Record<string, number>>({});
  
  // Payment Form State
  const [paymentStep, setPaymentStep] = useState<PaymentStep>("select");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [userCountryCode, setUserCountryCode] = useState<string | null>(null); // Start with null, load from profile first

  // Get user's geolocation
  const geoLocation = useGeolocation(userId, true);

  // Get selected package
  const selectedPackage = packages.find(p => p.id === selectedPackageId) || null;
  
  // Get currency rate for user's country
  const currencyRate = userCountryCode ? getRateForCountry(userCountryCode) : null;
  const isBangladesh = userCountryCode?.toUpperCase() === 'BD';
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  
  // Fetch real international exchange rates for Google tab
  useEffect(() => {
    const fetchInternationalRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data = await res.json();
          if (data.rates) {
            setInternationalRates(data.rates);
            console.log('[Recharge] Fetched international exchange rates');
          }
        }
      } catch (err) {
        console.error('[Recharge] Failed to fetch international rates:', err);
        recordClientError({ label: "Recharge.data", message: err instanceof Error ? err.message : String(err) });
      }
    };
    fetchInternationalRates();
  }, []);

  // Keep bonus particles stable across re-renders (prevents visual jumping + style collision warnings)
  const bonusParticles = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      size: 2 + Math.random() * 3,
      color: i % 2 === 0 ? '#FFD700' : '#FFA500',
      left: `${10 + i * 11}%`,
      top: `${20 + (i % 3) * 25}%`,
      duration: `${2 + Math.random() * 2}s`,
      delay: `${i * 0.3}s`,
      opacity: 0.6 + Math.random() * 0.4,
    }));
  }, []);

  const normalizePaymentKey = useCallback((value: string | null | undefined) => {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }, []);

  const paymentBrandFallback = useCallback(
    (value: string | null | undefined) => PAYMENT_BRAND_FALLBACKS[normalizePaymentKey(value)] || "💳",
    [normalizePaymentKey]
  );

  // Build a fast admin-logo lookup keyed by method name / type so every
  // helper method always resolves to a valid brand logo (bKash, Nagad, Rocket,
  // Upay, ePay, Binance Pay, JazzCash, Easypaisa, Paytm, PhonePe, USDT, etc.).
  const adminLogoMap = useMemo(() => {
    const map = new Map<string, string>();
    (adminPaymentMethods || []).forEach((a: any) => {
      const logo = a?.icon_url || (a?.additional_info as any)?.logo_url || null;
      if (!logo) return;
      [a?.name, a?.method_type, (a?.additional_info as any)?.display_method]
        .filter(Boolean)
        .flatMap((v: string) => {
          const raw = String(v).toLowerCase().trim();
          return [raw, normalizePaymentKey(raw)];
        })
        .forEach((key: string) => { if (key && !map.has(key)) map.set(key, logo); });
    });
    return map;
  }, [adminPaymentMethods, normalizePaymentKey]);

  const resolveMethodLogo = useCallback(
    (currentLogo: string | null | undefined, methodName: string | null | undefined): string | null => {
      if (currentLogo) return currentLogo;
      if (!methodName) return null;
      const key = String(methodName).toLowerCase().trim();
      if (adminLogoMap.has(key)) return adminLogoMap.get(key)!;
      const normalizedKey = normalizePaymentKey(key);
      if (adminLogoMap.has(normalizedKey)) return adminLogoMap.get(normalizedKey)!;
      // Fuzzy contains match (e.g. "bkash auto" → "bkash")
      for (const [k, v] of adminLogoMap.entries()) {
        if (key.includes(k) || k.includes(key) || normalizedKey.includes(k) || k.includes(normalizedKey)) return v;
      }
      return null;
    },
    [adminLogoMap, normalizePaymentKey]
  );

  // Pick a random helper for the static card display; changes when payment type or methods change
  const currentHelperMethod = useMemo(() => {
    if (helperPaymentMethods.length === 0) return null;

    if (selectedPaymentType) {
      const matchedMethods = helperPaymentMethods.filter(
        (method) => method.method_name.toLowerCase() === selectedPaymentType.toLowerCase()
      );
      if (matchedMethods.length > 0) {
        // Round-robin: pick from unused methods first
        const usedKey = `static:${selectedPaymentType.toLowerCase()}`;
        const usedIds = usedMethodsByType[usedKey] || [];
        const unused = matchedMethods.filter(m => !usedIds.includes(m.id));
        const pool = unused.length > 0 ? unused : matchedMethods;
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }

    // Random pick from all methods
    return helperPaymentMethods[Math.floor(Math.random() * helperPaymentMethods.length)];
  }, [helperPaymentMethods, selectedPaymentType, usedMethodsByType]);

  const isAutoGatewayMethod = useCallback((method: Level5HelperPaymentMethod) => {
    const gatewayType = String(method.additional_info?.gateway_type || '').toLowerCase();
    return gatewayType === 'sslcommerz' || gatewayType === 'aamarpay' || gatewayType === 'zinipay';
  }, []);

  const pickNonRepeatingMethod = useCallback((methods: Level5HelperPaymentMethod[], methodKey: string) => {
    if (methods.length === 0) return null;

    // Round-robin: track ALL used methods, only reset when ALL have been shown
    const usedIds = usedMethodsByType[methodKey] || [];
    const unusedMethods = methods.filter(m => !usedIds.includes(m.id));
    
    // If all methods have been used, reset the cycle
    const availableMethods = unusedMethods.length > 0 ? unusedMethods : methods;
    
    // Pick randomly from available (unused) methods
    const chosenMethod = availableMethods[Math.floor(Math.random() * availableMethods.length)];

    // Update used methods tracker
    const newUsedIds = unusedMethods.length > 0 
      ? [...usedIds, chosenMethod.id]  // Add to existing cycle
      : [chosenMethod.id];  // Start new cycle
    
    setUsedMethodsByType((prev) => {
      const updated = { ...prev, [methodKey]: newUsedIds };
      if (typeof window !== "undefined") {
        localStorage.setItem('recharge_used_methods', JSON.stringify(updated));
      }
      return updated;
    });

    setLastSelectedMethodByType((prev) => ({
      ...prev,
      [methodKey]: chosenMethod.id,
    }));

    console.log(`[Recharge] Round-robin pick for ${methodKey}: method selected`);

    return chosenMethod;
  }, [usedMethodsByType, lastSelectedMethodByType]);

  const getHelperMethodPool = useCallback((baseMethod: Level5HelperPaymentMethod | null) => {
    if (!baseMethod) return [] as Level5HelperPaymentMethod[];

    const methodName = baseMethod.method_name.toLowerCase();
    const baseGatewayType = String(baseMethod.additional_info?.gateway_type || '').toLowerCase();

    const sameTypeMethods = helperPaymentMethods.filter(
      (method) => method.method_name.toLowerCase() === methodName
    );

    const exactRouteMatches = sameTypeMethods.filter(
      (method) => String(method.additional_info?.gateway_type || '').toLowerCase() === baseGatewayType
    );

    return exactRouteMatches.length > 0 ? exactRouteMatches : sameTypeMethods;
  }, [helperPaymentMethods]);

  const getHelperMethodCycleKey = useCallback((baseMethod: Level5HelperPaymentMethod | null) => {
    if (!baseMethod) return '';
    const methodName = baseMethod.method_name.toLowerCase();
    const gatewayType = String(baseMethod.additional_info?.gateway_type || '').toLowerCase();
    return `${methodName}:${gatewayType || 'manual'}`;
  }, []);

  const helperMethodPool = useMemo(() => getHelperMethodPool(selectedHelperMethod), [getHelperMethodPool, selectedHelperMethod]);

  const helperMethodCycleProgress = useMemo(() => {
    const cycleKey = getHelperMethodCycleKey(selectedHelperMethod);
    const total = helperMethodPool.length;
    if (!cycleKey || total === 0) return { current: 1, total: 1 };

    const usedCount = (usedMethodsByType[cycleKey] || []).length;
    return {
      current: Math.min(Math.max(usedCount, 1), total),
      total,
    };
  }, [getHelperMethodCycleKey, helperMethodPool.length, selectedHelperMethod, usedMethodsByType]);

  const handleShowDifferentHelperNumber = useCallback(() => {
    if (!selectedHelperMethod) return;

    const pool = getHelperMethodPool(selectedHelperMethod);
    if (pool.length <= 1) {
      toast({
        title: "No More Numbers",
        description: `Only one ${selectedHelperMethod.method_name} number is available right now.`,
      });
      return;
    }

    const nextMethod = pickNonRepeatingMethod(pool, getHelperMethodCycleKey(selectedHelperMethod));
    if (!nextMethod) return;

    setSelectedHelperMethod(nextMethod);
    setHelperTransactionId("");
    setHelperPaymentProof(null);
  }, [getHelperMethodCycleKey, getHelperMethodPool, pickNonRepeatingMethod, selectedHelperMethod, toast]);

  const selectBalancedLocalMethod = useCallback(() => {
    if (!selectedPaymentType) return null;

    const normalizedType = selectedPaymentType.toLowerCase();
    const methodsForType = helperPaymentMethods.filter(
      (method) => method.method_name.toLowerCase() === normalizedType
    );

    if (methodsForType.length === 0) return null;

    const autoMethods = methodsForType.filter(isAutoGatewayMethod);
    const manualMethods = methodsForType.filter((method) => !isAutoGatewayMethod(method));

    if (autoMethods.length > 0 && manualMethods.length > 0) {
      const activeRoute = nextLocalRoute;
      const pool = activeRoute === 'auto' ? autoMethods : manualMethods;
      setNextLocalRoute((prev) => (prev === 'auto' ? 'manual' : 'auto'));
      return pickNonRepeatingMethod(pool, `${normalizedType}:${activeRoute}`);
    }

    if (autoMethods.length > 0) {
      return pickNonRepeatingMethod(autoMethods, `${normalizedType}:auto`);
    }

    return pickNonRepeatingMethod(manualMethods, `${normalizedType}:manual`);
  }, [helperPaymentMethods, isAutoGatewayMethod, nextLocalRoute, pickNonRepeatingMethod, selectedPaymentType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LOCAL_ROUTE_STORAGE_KEY, nextLocalRoute);
  }, [nextLocalRoute]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LAST_METHOD_STORAGE_KEY, JSON.stringify(lastSelectedMethodByType));
  }, [lastSelectedMethodByType]);

  // Fetch Level 5 Helper Payment Methods - AUTOMATIC based on helper's own payment methods
  // Helpers add their own payment numbers, and if they have 300K+ diamonds, it auto-shows here
  const fetchLevel5HelperPaymentMethods = useCallback(async () => {
    if (!userCountryCode) {
      console.log('[Recharge] Skipping helper fetch - no country code yet');
      return;
    }
    
    try {
      console.log('[Recharge] Fetching AUTOMATIC helper payment methods for country:', userCountryCode);
      
      // ========================================
      // AUTOMATIC PAYMENT METHOD FETCH - FROM BOTH TABLES
      // ========================================
      // Fetch from BOTH helper_payment_methods AND helper_country_payment_methods
      // Combined with topup_helpers to check balance/status
      
      // GLOBAL METHOD TYPES that should show in ALL countries
      const GLOBAL_METHOD_TYPES = ['crypto', 'usdt', 'trc20', 'erc20', 'btc', 'eth', 'cryptocurrency'];

      // FETCH 1: helper_payment_methods using actual schema
      // STRICT country filter at SQL: country_code = user's country (defense-in-depth
      // alongside the topup_helpers.country_code filter further down). Includes rows
      // whose country_code is still NULL (legacy un-backfilled) — those will be
      // gated by the helper-country join below.
      const { data: legacyMethodsData, error: legacyMethodsError } = await supabase
        .from('helper_payment_methods')
        .select(`
          id,
          helper_id,
          account_name,
          account_number,
          is_active,
          is_primary,
          method_type,
          country_code,
          logo_url,
          additional_info
        `)
        .eq('is_active', true)
        .or(`country_code.eq.${userCountryCode},country_code.is.null`);

      if (legacyMethodsError) {
        console.error('[Recharge] Error fetching legacy payment methods:', legacyMethodsError);
        recordClientError({ label: "Recharge.GLOBAL_METHOD_TYPES", message: legacyMethodsError instanceof Error ? legacyMethodsError.message : String(legacyMethodsError) });
      }

      // FETCH 2: helper_country_payment_methods using actual schema (include helper_id, account info, logo)
      const { data: countryMethodsData, error: countryMethodsError } = await supabase
        .from('helper_country_payment_methods')
        .select(`
          id,
          helper_id,
          country_code,
          country_name,
          payment_method_name,
          payment_type,
          icon_url,
          is_active,
          instructions,
          display_order,
          account_name,
          account_number,
          logo_url,
          method_type,
          additional_info
        `)
        .eq('country_code', userCountryCode)
        .eq('is_active', true);

      if (countryMethodsError) {
        console.error('[Recharge] Error fetching country payment methods:', countryMethodsError);
        recordClientError({ label: "Recharge.GLOBAL_METHOD_TYPES", message: countryMethodsError instanceof Error ? countryMethodsError.message : String(countryMethodsError) });
      }

      // FETCH 3: Global/Crypto methods from ALL countries (show everywhere)
      const { data: globalMethodsData, error: globalMethodsError } = await supabase
        .from('helper_country_payment_methods')
        .select(`
          id,
          country_code,
          country_name,
          payment_method_name,
          payment_type,
          icon_url,
          is_active,
          instructions,
          display_order
        `)
        .neq('country_code', userCountryCode)
        .in('payment_method_name', GLOBAL_METHOD_TYPES)
        .eq('is_active', true);

      if (globalMethodsError) {
        console.error('[Recharge] Error fetching global payment methods:', globalMethodsError);
        recordClientError({ label: "Recharge.GLOBAL_METHOD_TYPES", message: globalMethodsError instanceof Error ? globalMethodsError.message : String(globalMethodsError) });
      }

      // Combine both arrays - transform to common format
      const legacyNormalized = (legacyMethodsData || []).map((m: any) => ({
        id: m.id,
        helper_id: m.helper_id,
        // Use the row's real country_code if present; else inherit user's country
        // (will still be cross-checked via topup_helpers.country_code below).
        country_code: m.country_code || userCountryCode,
        payment_type: m.method_type,
        method_type: m.method_type,
        account_name: m.account_name,
        account_number: m.account_number,
        bank_name: (m.additional_info as any)?.bank_name || null,
        logo_url: m.logo_url || (m.additional_info as any)?.logo_url || (m.additional_info as any)?.icon_url || null,
        merchant_number: (m.additional_info as any)?.merchant_number || null,
        is_merchant: Boolean((m.additional_info as any)?.is_merchant),
        additional_info: m.additional_info || null,
        source: 'legacy'
      }));

      const countryMethodName = String((countryMethodsData?.[0] as any)?.payment_method_name || '').toLowerCase();
      const matchingLegacyMethods = legacyNormalized.filter((m: any) => m.payment_type?.toLowerCase() === countryMethodName);

      const countryNormalized = (countryMethodsData || []).flatMap((m: any) => {
        const matchedLegacy = legacyNormalized.filter((legacy: any) =>
          legacy.payment_type?.toLowerCase() === String(m.payment_method_name || '').toLowerCase()
        );

        if (matchedLegacy.length === 0) {
          // Use helper_id from country payment method record if available
          const countryHelperId = m.helper_id || `country-${m.id}`;
          return [{
            id: m.id,
            helper_id: countryHelperId,
            country_code: m.country_code,
            payment_type: m.payment_method_name,
            method_type: m.method_type || m.payment_type || m.payment_method_name,
            account_name: m.account_name || m.country_name || m.payment_method_name,
            account_number: m.account_number || '',
            bank_name: null,
            logo_url: m.logo_url || m.icon_url || (m.additional_info as any)?.logo_url || (m.additional_info as any)?.icon_url || null,
            instructions: m.instructions,
            merchant_number: null,
            is_merchant: Boolean((m.additional_info as any)?.is_merchant),
            additional_info: {
              ...(m.additional_info || {}),
              source_table: 'helper_country_payment_methods',
              display_order: m.display_order,
            },
            source: 'country',
          }];
        }

        return matchedLegacy.map((legacy: any) => ({
        id: m.id,
          helper_id: legacy.helper_id,
          country_code: m.country_code,
          payment_type: m.payment_method_name,
          method_type: m.payment_type || legacy.method_type || m.payment_method_name,
          account_name: legacy.account_name,
          account_number: legacy.account_number,
          bank_name: legacy.bank_name,
          logo_url: m.logo_url || m.icon_url || legacy.logo_url || (m.additional_info as any)?.logo_url || (legacy.additional_info as any)?.logo_url || null,
          instructions: m.instructions,
          merchant_number: legacy.merchant_number || null,
          is_merchant: legacy.is_merchant || false,
          additional_info: {
            ...(legacy.additional_info || {}),
            source_table: 'helper_country_payment_methods',
            display_order: m.display_order,
          },
          source: 'country'
        }));
      });

      // Global/Crypto methods (from other countries, shown everywhere)
      const globalNormalized = (globalMethodsData || []).map((m: any) => ({
        id: m.id,
        helper_id: `global-${m.id}`,
        country_code: m.country_code,
        payment_type: m.payment_method_name,
        method_type: m.payment_type || m.payment_method_name,
        account_name: m.country_name || m.payment_method_name,
        account_number: '',
        bank_name: null,
        logo_url: m.logo_url || m.icon_url || (m.additional_info as any)?.logo_url || null,
        instructions: m.instructions,
        merchant_number: null,
        is_merchant: false,
        additional_info: {
          source_table: 'helper_country_payment_methods',
          is_global: true,
          display_order: m.display_order,
        },
        source: 'global'
      }));

      // Deduplicate: if same method already exists from country fetch, skip global duplicate
      const existingIds = new Set([...legacyNormalized, ...countryNormalized].map(m => m.id));
      const uniqueGlobal = globalNormalized.filter(m => !existingIds.has(m.id));

      const combinedMethodsData = [...legacyNormalized, ...countryNormalized, ...uniqueGlobal];

      if (combinedMethodsData.length === 0) {
        console.log('[Recharge] No payment methods found for country:', userCountryCode);
        setHelperPaymentMethods([]);
        return;
      }

      console.log('[Recharge] Combined payment methods:', {
        legacy: legacyNormalized.length,
        country: countryNormalized.length,
        total: combinedMethodsData.length
      });

      // Get unique helper IDs
      const helperIds = [...new Set(combinedMethodsData.map(m => m.helper_id).filter((id: string) => !id.startsWith('country-') && !id.startsWith('global-')))];
      
      // STRICT COUNTRY FILTER on the helper itself — guarantees BD methods only
      // show in BD, IN methods only in IN, PK in PK, etc. Combined with the
      // country filter on helper_country_payment_methods, leakage is impossible.
      const { data: helpersData, error: helpersError } = await supabase
        .from('topup_helpers')
        .select(`
          id,
          user_id,
          wallet_balance,
          country_code,
          trader_level,
          payroll_enabled,
          is_active,
          is_verified
        `)
        .in('id', helperIds)
        .eq('country_code', userCountryCode);

      if (helpersError) {
        console.error('[Recharge] Error fetching helpers:', helpersError);
        recordClientError({ label: "Recharge.helperIds", message: helpersError instanceof Error ? helpersError.message : String(helpersError) });
        return;
      }

      // Get profile data for online status
      const userIds = (helpersData || []).map(h => h.user_id).filter(Boolean);
      
      // Fetch profiles AND agency diamond balances in parallel
      // Use security definer function for agency balance (avoids RLS restriction)
      const [profilesResult, ...agencyBalanceResults] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, avatar_url, app_uid, is_online')
          .in('id', userIds),
        ...userIds.map(uid => 
          supabase.rpc('get_agency_diamond_balance', { owner_user_id: uid })
        )
      ]);

      if (profilesResult.error) {
        console.error('[Recharge] Error fetching profiles:', profilesResult.error);
        recordClientError({ label: "Recharge.userIds", message: profilesResult.error instanceof Error ? profilesResult.error.message : String(profilesResult.error) });
      }

      // Create lookup maps
      const helpersMap = new Map((helpersData || []).map(h => [h.id, h]));
      const profilesMap = new Map((profilesResult.data || []).map(p => [p.id, p]));
      // Agency diamond balance lookup by owner_id (user_id) - from RPC results
      const agencyDiamondMap = new Map<string, number>();
      userIds.forEach((uid, index) => {
        const result = agencyBalanceResults[index];
        agencyDiamondMap.set(uid, (result?.data as number) ?? 0);
      });

      // Combine data
      const data = combinedMethodsData.map(m => {
        const helper = helpersMap.get(m.helper_id);
        const profile = helper ? profilesMap.get(helper.user_id) : null;
        const agencyDiamonds = helper ? (agencyDiamondMap.get(helper.user_id) || 0) : 0;
        return {
          ...m,
          helper: helper ? {
            ...helper,
            agency_diamond_balance: agencyDiamonds,
            user: profile || null
          } : null
        };
      });

      // ========================================
      // AUTO-VISIBILITY LOGIC (Based on COMBINED Balance)
      // ========================================
      // Payment methods AUTOMATICALLY show/hide based on:
      // 1. trader_level = 5 (Level 5 Payroll Helper)
      // 2. COMBINED balance (wallet_balance + agency diamond_balance) >= 300,000
      //    - wallet_balance = helper's own wallet (from topup_helpers)
      //    - agency diamond_balance = agency's diamonds (from agencies table)
      // 3. Helper must be verified
      // 4. Helper must be active
      // 
      // NOTE: Online status is NOT required - helpers can receive payments even when offline
      // NO MANUAL TOGGLE NEEDED - Balance controls everything!
      const MIN_BALANCE = 300000; // 3 Lakh (300,000) diamonds minimum
      
      const validMethods = (data || []).filter((m: any) => {
        const helper = m.helper;
        
        // If method has a real helper (from topup_helpers), apply full validation
        if (helper) {
          const walletBalance = helper.wallet_balance ?? 0;
          const agencyDiamonds = helper.agency_diamond_balance ?? 0;
          const combinedBalance = walletBalance + agencyDiamonds;
          const isLevel5PayrollHelper = helper.trader_level === 5 && helper.payroll_enabled === true;
          const hasMinBalance = combinedBalance >= MIN_BALANCE;
          const isVerified = helper.is_verified === true;
          const isHelperActive = helper.is_active === true;
          
          console.log('[Recharge] Auto-check helper:', helper.user?.display_name, {
            walletBalance,
            agencyDiamonds,
            combinedBalance,
            isLevel5PayrollHelper,
            hasMinBalance,
            isVerified,
            isHelperActive,
            source: m.source,
            willShow: isLevel5PayrollHelper && hasMinBalance && isVerified && isHelperActive
          });
          
          return isLevel5PayrollHelper && hasMinBalance && isVerified && isHelperActive && Boolean(m.account_number);
        }
        
        // Methods without a helper record (orphaned country/global entries) — only show if they have account info
        if (m.source === 'global' || m.source === 'country') {
          return Boolean(m.account_number);
        }

        return false;
      });

      // Transform to expected format
      const transformedMethods = validMethods.map((m: any) => {
        const isGateway = m.additional_info?.gateway_type === 'sslcommerz' || m.additional_info?.gateway_type === 'aamarpay' || m.additional_info?.gateway_type === 'zinipay';
        // For gateway methods, use the display_method name (bkash, nagad etc.) instead of gateway name
        const displayMethodName = isGateway && m.additional_info?.display_method 
          ? m.additional_info.display_method 
          : m.payment_type;
        return {
          id: m.id,
          helper_id: m.helper_id,
          country_code: m.country_code,
          method_name: displayMethodName,
          method_type: isGateway ? 'auto_gateway' : 'mobile_wallet',
          account_name: m.account_name,
          account_number: m.account_number,
          bank_name: m.bank_name,
          instructions: `Send to this ${displayMethodName} number`,
          logo_url: m.logo_url,
          merchant_number: m.merchant_number || null,
          is_merchant: m.is_merchant || false,
          additional_info: m.additional_info || null,
          helper: m.helper
        };
      });

      // Remove duplicate numbers per method+gateway type so each option is genuinely different
      const uniqueTransformedMethods = transformedMethods.filter((method, index, allMethods) => {
        const methodName = method.method_name.toLowerCase();
        const gatewayType = String(method.additional_info?.gateway_type || 'manual').toLowerCase();
        const accountNumber = String(method.account_number || '').trim();

        return (
          allMethods.findIndex((candidate) =>
            candidate.method_name.toLowerCase() === methodName &&
            String(candidate.additional_info?.gateway_type || 'manual').toLowerCase() === gatewayType &&
            String(candidate.account_number || '').trim() === accountNumber
          ) === index
        );
      });

      // STABLE SORT (not shuffle) — wallet chips must NOT move around between
      // fetches/re-renders. Different numbers only appear when the user clicks
      // a package (handled by pickNonRepeatingMethod cycling), not on idle.
      // Sort by method_name → display_order → account_number for deterministic order.
      const sorted = [...uniqueTransformedMethods].sort((a, b) => {
        const an = String(a.method_name || '').toLowerCase();
        const bn = String(b.method_name || '').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const ao = Number(a.additional_info?.display_order ?? 9999);
        const bo = Number(b.additional_info?.display_order ?? 9999);
        if (ao !== bo) return ao - bo;
        return String(a.account_number || '').localeCompare(String(b.account_number || ''));
      });

      const methodBreakdown: Record<string, number> = {};
      sorted.forEach(m => {
        const key = m.method_name.toLowerCase();
        methodBreakdown[key] = (methodBreakdown[key] || 0) + 1;
      });
      console.log('[Recharge] Stable-sorted', sorted.length, 'payment methods for country:', userCountryCode, '| Breakdown:', methodBreakdown);

      setHelperPaymentMethods(sorted as Level5HelperPaymentMethod[]);
    } catch (error) {
      console.error('Error fetching level 5 helper payment methods:', error);
      recordClientError({ label: "Recharge.key", message: error instanceof Error ? error.message : String(error) });
    }
  }, [userCountryCode]);

  // Fetch Admin-configured Payment Methods from topup_payment_methods.
  // NOTE: This table has NO country_code column — admin methods are GLOBAL
  // and act as the canonical brand-logo source for Local Pay (bKash, Nagad,
  // ePay, Binance Pay, etc.). Country-specific helper accounts come from
  // helper_country_payment_methods. We just need the LOGOS here.
  const fetchAdminPaymentMethods = useCallback(async () => {
    try {
      console.log('[Recharge] Fetching admin payment methods (logo source)');

      const { data, error } = await supabase
        .from('topup_payment_methods')
        .select('id, name, method_type, icon_url, additional_info, payment_number, payment_instructions, is_active, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('[Recharge] Error fetching admin payment methods:', error);
        recordClientError({ label: "Recharge.fetchAdminPaymentMethods", message: error instanceof Error ? error.message : String(error) });
        return;
      }

      console.log('[Recharge] Admin payment methods loaded:', (data || []).length);
      setAdminPaymentMethods(data || []);
    } catch (error) {
      console.error('[Recharge] Error fetching admin payment methods:', error);
      recordClientError({ label: "Recharge.fetchAdminPaymentMethods", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    fetchUserData();
    fetchGateways();
    
    // Initialize Play Store Billing on Android
    const isAndroid = isAndroidNative;
    console.log('[Recharge] Platform check:', { 
      isNative: Capacitor.isNativePlatform(), 
      platform: Capacitor.getPlatform(),
      isAndroid 
    });
    
    if (isAndroid) {
      console.log('[Recharge] Android detected, initializing PlayStoreBilling via registerPlugin...');

      // Refresh package map from DB before initializing — keeps Play Store
      // product IDs/prices in sync with the admin-edited coin_packages table.
      loadPlayStoreProducts().finally(() => {
      playStoreBilling.initialize().then(async (available) => {
        console.log('[Recharge] Play Store Billing initialize result:', available);
        setIsPlayStoreAvailable(available);
        setSelectedPaymentMethod('playstore');
        if (available) {
          console.log('[Recharge] ✅ Play Store Billing ready!');
          // Auto-retry any pending/undelivered purchases
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
              const recovered = await playStoreBilling.retryPendingPurchases(session.user.id);
              if (recovered > 0) {
                toast({
                  title: "✅ Purchase Recovered!",
                  description: `${recovered} pending purchase(s) have been delivered.`,
                });
              }
            }
          } catch (retryErr) {
            console.warn('[Recharge] Pending purchase retry failed:', retryErr);
          }
        } else {
          const errorMsg = playStoreBilling.getLastError();
          console.log('[Recharge] ⚠️ Play Store Billing init failed:', errorMsg);
        }
      }).catch(err => {
        console.error('[Recharge] ❌ Play Store Billing error:', err);
        recordClientError({ label: "Recharge.errorMsg", message: err instanceof Error ? err.message : String(err) });
        setSelectedPaymentMethod('playstore');
      });
      }); // close loadPlayStoreProducts().finally
    } else {
      console.log('[Recharge] Not Android - web mode');
      setSelectedPaymentMethod('playstore');
    }
  }, [isAndroidNative]);

  // Fetch Level 1-4 diamond trader helpers (exclude Level 5 payroll helpers - they show in Local Pay)
  const fetchTopUpHelpers = useCallback(async () => {
    if (!userCountryCode) return;
    try {
      console.log('[Recharge] Fetching helpers for country:', userCountryCode);
      
      const { data: helpers, error } = await supabase
        .from('topup_helpers')
        .select(`
          id,
          user_id,
          wallet_balance,
          country_code,
          trader_level,
          total_sold,
          contact_info,
          order_notification_phone,
          user:profiles!topup_helpers_user_id_fkey(id, display_name, avatar_url, is_online, app_uid, country_code, country_flag, country_name)
        `)
        .eq('is_active', true)
        .eq('is_verified', true)
        .neq('trader_level', 5)
        .gte('wallet_balance', 100000)
        .order('total_sold', { ascending: false });

      if (error) {
        console.error('Error fetching helpers:', error);
        recordClientError({ label: "Recharge.fetchTopUpHelpers", message: error instanceof Error ? error.message : String(error) });
        return;
      }

      if (helpers) {
        // STRICT country match using PROFILE's country_code (actual user location)
        const filtered = helpers.filter(h => {
          const user = h.user as any;
          const profileCountry = user?.country_code || h.country_code;
          return profileCountry === userCountryCode;
        });
        
        const mapped = filtered.map(h => {
          const user = h.user as any;
          const contactInfo = (h as any).contact_info as any;
          const whatsapp = contactInfo?.whatsapp || contactInfo?.whatsapp_number || (h as any).order_notification_phone || null;
          return {
            id: user?.id || h.user_id,
            helperId: h.id,
            name: user?.display_name || 'Helper',
            avatar: user?.avatar_url || '',
            userId: h.user_id,
            appUid: user?.app_uid || '',
            isOnline: user?.is_online || false,
            walletBalance: h.wallet_balance ?? 0,
            traderLevel: h.trader_level || 1,
            countryCode: user?.country_code || h.country_code || '',
            countryFlag: user?.country_flag || '🌍',
            countryName: user?.country_name || h.country_code || 'Unknown',
            totalSold: h.total_sold || 0,
            whatsappNumber: whatsapp,
            acceptedMethods: [] as AcceptedMethodLogo[],
          };
        });
        // Sort by total_sold desc (highest sellers first)
        mapped.sort((a, b) => b.totalSold - a.totalSold);

        // Fetch accepted payment methods for all helpers in one query
        const helperIds = mapped.map(m => m.helperId);
        if (helperIds.length > 0) {
          const { data: acceptedRows } = await supabase
            .from('helper_accepted_payment_methods' as any)
            .select('helper_id, gateway_id')
            .in('helper_id', helperIds)
            .eq('is_enabled', true);

          const gatewayIds = [...new Set(((acceptedRows as any[]) || []).map((r: any) => r.gateway_id))];
          let gatewayMap = new Map<string, AcceptedMethodLogo>();
          if (gatewayIds.length > 0) {
            const { data: gws } = await supabase
              .from('payment_gateways')
              .select('id, name, logo_url, is_integrated')
              .in('id', gatewayIds);
            gatewayMap = new Map(
              ((gws as any[]) || []).map((g: any) => [
                g.id,
                { gateway_id: g.id, name: g.name, logo_url: g.logo_url, is_integrated: !!g.is_integrated },
              ])
            );
          }

          const byHelper = new Map<string, AcceptedMethodLogo[]>();
          ((acceptedRows as any[]) || []).forEach((r: any) => {
            const gw = gatewayMap.get(r.gateway_id);
            if (!gw) return;
            const arr = byHelper.get(r.helper_id) || [];
            arr.push(gw);
            byHelper.set(r.helper_id, arr);
          });
          mapped.forEach(m => {
            m.acceptedMethods = byHelper.get(m.helperId) || [];
          });
        }

        setTopUpHelpers(mapped);
      }
    } catch (error) {
      console.error('Error fetching helpers:', error);
      recordClientError({ label: "Recharge.arr", message: error instanceof Error ? error.message : String(error) });
    }
  }, [userCountryCode]);


  // Fetch helper payment methods AND admin payment methods when country code changes
  useEffect(() => {
    if (userCountryCode) {
      fetchLevel5HelperPaymentMethods();
      fetchAdminPaymentMethods();
    }
  }, [userCountryCode, fetchLevel5HelperPaymentMethods, fetchAdminPaymentMethods]);

  // Card payment is disabled for Bangladesh users
  useEffect(() => {
    if (isBangladesh && selectedPaymentMethod === 'stripe') {
      setSelectedPaymentMethod('local');
    }
  }, [isBangladesh, selectedPaymentMethod]);

  // Real-time subscription for helper payment methods (BOTH tables)
  useEffect(() => {
    const channel = supabase
      .channel('recharge-helper-methods-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_payment_methods' },
        () => {
          console.log('[Recharge] Helper payment methods updated (from helper_payment_methods)');
          fetchLevel5HelperPaymentMethods();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_country_payment_methods' },
        () => {
          console.log('[Recharge] Helper payment methods updated (from helper_country_payment_methods)');
          fetchLevel5HelperPaymentMethods();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topup_helpers' },
        () => {
          console.log('[Recharge] Helper data updated - checking eligibility (both Level 5 + Level 1-4)');
          fetchLevel5HelperPaymentMethods();
          fetchTopUpHelpers(); // Also refresh Level 1-4 traders when balance changes
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agencies' },
        () => {
          console.log('[Recharge] Agency data changed - rechecking helper eligibility');
          fetchLevel5HelperPaymentMethods();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_diamond_transactions' },
        () => {
          console.log('[Recharge] Agency diamond transaction detected - rechecking helper eligibility');
          fetchLevel5HelperPaymentMethods();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coin_transfers' },
        () => {
          console.log('[Recharge] Coin transfer detected - rechecking helper eligibility');
          fetchLevel5HelperPaymentMethods();
          fetchTopUpHelpers();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => {
          console.log('[Recharge] Profile updated - checking online status');
          fetchLevel5HelperPaymentMethods();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topup_payment_methods' },
        () => {
          console.log('[Recharge] Admin payment methods updated');
          fetchAdminPaymentMethods();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLevel5HelperPaymentMethods, fetchAdminPaymentMethods, fetchTopUpHelpers]);

  // REMOVED: Modal rotation is disabled - number stays FIXED once modal opens
  // New helper is only selected when modal opens fresh (selection advances to next helper on package click)
  // This prevents user confusion during payment process

  // Keep helper method card static; do not auto-rotate

  // Auto-select first payment type when helper methods load
  useEffect(() => {
    console.log('[Recharge] Helper payment methods loaded:', helperPaymentMethods.length, 'methods');
    if (helperPaymentMethods.length > 0) {
      console.log('[Recharge] Local Pay should be visible now!');
      // Auto-select the first available payment type so numbers show immediately
      const availableTypes = Array.from(new Set(helperPaymentMethods.map(m => m.method_name.toLowerCase())));
      if (availableTypes.length > 0 && !selectedPaymentType) {
        console.log('[Recharge] Auto-selecting first payment type:', availableTypes[0]);
        setSelectedPaymentType(availableTypes[0]);
      }
    }
  }, [helperPaymentMethods, selectedPaymentType]);

  // Update country code when geolocation changes - but ONLY if profile doesn't have it
  useEffect(() => {
    if (geoLocation.countryCode && !userCountryCode) {
      console.log('[Recharge] Using geolocation country_code (fallback):', geoLocation.countryCode);
      setUserCountryCode(geoLocation.countryCode);
    }
  }, [geoLocation.countryCode, userCountryCode]);

  // Re-fetch gateways when country changes (country-strict gateway list)
  useEffect(() => {
    if (userCountryCode) {
      fetchGateways();
    }
  }, [userCountryCode]);

  // Fetch helpers when tab is selected OR country changes
  useEffect(() => {
    if (selectedTab === "helper" && userCountryCode) {
      fetchTopUpHelpers();
    }
  }, [selectedTab, userCountryCode, fetchTopUpHelpers]);

  // Keep helper cards static; do not auto-rotate pages

  // REALTIME: Re-fetch helpers when profiles (online status) changes
  useEffect(() => {
    if (selectedTab !== "helper") return;

    const channel = supabase
      .channel('helpers-online-status-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'is_online=eq.true' },
        () => {
          console.log('[Recharge] Helper online status changed - refreshing');
          fetchTopUpHelpers();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'is_online=eq.false' },
        () => {
          console.log('[Recharge] Helper went offline - refreshing');
          fetchTopUpHelpers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topup_helpers' },
        () => {
          console.log('[Recharge] Helper data changed - refreshing');
          fetchTopUpHelpers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coin_transfers' },
        () => {
          console.log('[Recharge] Coin transfer in helper tab - refreshing');
          fetchTopUpHelpers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_accepted_payment_methods' },
        () => {
          console.log('[Recharge] Helper accepted methods changed - refreshing');
          fetchTopUpHelpers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTab, fetchTopUpHelpers]);

  const fetchUserData = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (user) {
        setUserId(user.id);
        const [profileRes, firstRechargeRes, bonusConfigRes] = await Promise.all([
          supabase.from('profiles').select('coins, country_code, app_uid').eq('id', user.id).single(),
          supabase.from('first_recharge_claims').select('id').eq('user_id', user.id).maybeSingle(),
          supabase.from('first_recharge_bonus').select('bonus_multiplier, banner_image_url, banner_title, banner_subtitle, banner_type').eq('is_active', true).maybeSingle(),
        ]);

        if (profileRes.data) {
          updateCachedBalance(profileRes.data.coins || 0);
          if (profileRes.data.country_code) {
            console.log('[Recharge] Using profile country_code:', profileRes.data.country_code);
            setUserCountryCode(profileRes.data.country_code);
          }
          if (profileRes.data.app_uid) {
            setUserAppUid(profileRes.data.app_uid);
          }
        }
        
        setIsFirstRecharge(!firstRechargeRes.data);
        if (bonusConfigRes.data) {
          setFirstRechargeBonus(Number(bonusConfigRes.data.bonus_multiplier) || 2.0);
          setRechargeBannerConfig({
            banner_image_url: bonusConfigRes.data.banner_image_url,
            banner_title: bonusConfigRes.data.banner_title,
            banner_subtitle: bonusConfigRes.data.banner_subtitle,
            banner_type: bonusConfigRes.data.banner_type,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      recordClientError({ label: "Recharge.user", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const fetchGateways = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_gateways')
        .select('id, name, gateway_type, config, supported_currencies, country_codes, logo_url')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      // STRICT country filter: gateway must contain user's country in country_codes
      // (or have NULL/empty country_codes = treated as global, e.g. crypto/USDT)
      const cc = (userCountryCode || '').toUpperCase();
      const countryFiltered = (data || []).filter((g: any) => {
        const codes: string[] = Array.isArray(g.country_codes) ? g.country_codes.map((c: string) => String(c).toUpperCase()) : [];
        if (codes.length === 0) return true; // global
        return cc ? codes.includes(cc) : false;
      });
      const dataFiltered = countryFiltered;
      // Re-bind to keep downstream mapping unchanged
      const _data = dataFiltered;
      
      // Map data to include payment_number and payment_instructions from settings
      const mappedGateways: PaymentGateway[] = (_data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        gateway_code: g.gateway_type,
        description: (g.config as any)?.description || '',
        logo_url: g.logo_url || (g.config as any)?.logo_url || null,
        supported_currencies: g.supported_currencies || [],
        fee_percentage: Number((g.config as any)?.fee_percentage) || 0,
        fee_fixed: Number((g.config as any)?.fee_fixed) || 0,
        payment_number: (g.config as any)?.payment_number || '',
        payment_instructions: (g.config as any)?.payment_instructions || ''
      }));
      
      setGateways(mappedGateways);
    } catch (error) {
      console.error('Error fetching gateways:', error);
      recordClientError({ label: "Recharge.mappedGateways", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Re-select gateway when currency changes
  useEffect(() => {
    if (currencyRate && gateways.length > 0) {
      const matchingGateway = gateways.find(g => 
        g.supported_currencies.includes(currencyRate.currency_code)
      );
      if (matchingGateway) {
        setSelectedGateway(matchingGateway);
      } else if (gateways.length > 0) {
        setSelectedGateway(gateways[0]);
      }
    }
  }, [currencyRate, gateways]);


  const formatNumber = (num: SafeNumberInput) => {
    const parsed = typeof num === 'string' ? Number(num) : num;
    if (parsed === null || parsed === undefined || Number.isNaN(parsed)) {
      return '0';
    }
    return parsed.toLocaleString('en-US');
  };

  const SYMBOL_FALLBACK: Record<string, string> = {
    BDT: 'Tk ', INR: '₹', PKR: '₨', EUR: '€', GBP: '£', USD: '$',
    MYR: 'RM', TRY: '₺', SAR: 'ر.س', AED: 'د.إ', JPY: '¥', KRW: '₩',
    THB: '฿', VND: '₫', IDR: 'Rp', PHP: '₱', BRL: 'R$', EGP: 'E£',
    NGN: '₦', ZAR: 'R', CNY: '¥', SGD: 'S$', HKD: 'HK$', TWD: 'NT$',
    NPR: 'रू', OMR: 'ر.ع', QAR: 'ر.ق', KWD: 'د.ك', LKR: 'Rs', BHD: '.د.ب',
    JOD: 'JD', KES: 'KSh', GHS: 'GH₵',
  };

  // Convert USD to local currency using REAL international exchange rates (Google Play standard)
  const convertToLocalCurrency = (priceUsd: number): string => {
    if (!currencyRate) return `$${priceUsd.toFixed(2)}`;
    
    const currencyCode = currencyRate.currency_code;
    
    // Use real international rate if available (exact market rate, no markup)
    const internationalRate = internationalRates[currencyCode];
    const rate = internationalRate || currencyRate.rate_to_usd;
    const localPrice = priceUsd * rate;
    
    const symbol = currencyRate.currency_symbol || SYMBOL_FALLBACK[currencyCode] || currencyCode + ' ';
    const isLargeValue = localPrice >= 100;
    return `${symbol}${isLargeValue ? Math.round(localPrice).toLocaleString('en-US') : localPrice.toFixed(2)}`;
  };

  // Gateway icon - No hardcoded defaults, use logo_url from database
  const getGatewayIcon = (code: string, logoUrl?: string | null) => {
    // Always use the payment method's logo from database if available
    if (logoUrl) return null; // Will render img tag instead
    // Default generic icon only as fallback
    return "💳";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Number copied to clipboard",
    });
  };

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProof(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `payment-proof-${userId}-${Date.now()}.${fileExt}`;
      const filePath = `payment-proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filePath);

      setPaymentProof(publicUrl);
      toast({
        title: "Uploaded!",
        description: "Payment proof uploaded successfully",
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      recordClientError({ label: "Recharge.filePath", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Upload Failed",
        description: "Could not upload payment proof. Try again.",
        variant: "destructive"
      });
    } finally {
      setUploadingProof(false);
    }
  };

  // Handle Play Store Purchase
  const handlePlayStorePurchase = async () => {
    if (!selectedPackage || !userId) {
      toast({
        title: "Select Package",
        description: "Please select a diamond package first",
        variant: "destructive"
      });
      return;
    }

    const productId = playStoreBilling.getProductIdForCoins(selectedPackage.coins);
    if (!productId) {
      toast({
        title: "Product Not Available",
        description: "This package is not available for Play Store purchase",
        variant: "destructive"
      });
      return;
    }

    setPlayStoreProcessing(true);

    try {
      const result = await playStoreBilling.purchase(productId, userId);
      
      if (result.success) {
        // Refresh balance
        await fetchUserData();
        
        toast({
          title: "🎉 Purchase Successful!",
          description: `${formatNumber(selectedPackage.coins)} diamonds added to your account`,
        });
        
        // Mark campaign as purchased if navigated from campaign
        if (campaignId) localStorage.setItem('campaign_purchased_' + campaignId, 'true');
        setSelectedPackageId(null);
      } else {
        toast({
          title: "Purchase Failed",
          description: result.error || "Could not complete purchase. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('[Recharge] Play Store purchase error:', error);
      recordClientError({ label: "Recharge.result", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Purchase Error",
        description: error.message || "An error occurred during purchase",
        variant: "destructive"
      });
    } finally {
      setPlayStoreProcessing(false);
    }
  };

  // Handle Stripe Payment
  const handleStripePurchase = async () => {
    if (!selectedPackage || !userId) {
      toast({
        title: "Select Package",
        description: "Please select a diamond package first",
        variant: "destructive"
      });
      return;
    }

    setStripeProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-payment", {
        body: { 
          package_id: selectedPackage.id,
          origin_url: window.location.origin,
          country_code: userCountryCode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        // Open Stripe Checkout in new tab (or same window on mobile)
          const { openInApp } = await import("@/utils/inAppNavigation");
          await openInApp(data.url, { useOverlay: true });
      }
    } catch (error: any) {
      console.error("[Recharge] Stripe error:", error);
      recordClientError({ label: "Recharge.handleStripePurchase", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Payment Error",
        description: error.message || "Could not start Stripe payment",
        variant: "destructive"
      });
    } finally {
      setStripeProcessing(false);
    }
  };

  const handleStartPayment = () => {
    if (!selectedPackage) {
      toast({
        title: "Select Package",
        description: "Please select a diamond package first",
        variant: "destructive"
      });
      return;
    }

    // If Play Store is selected on Android, use Play Store Billing
    if (selectedPaymentMethod === 'playstore' && (isPlayStoreAvailable || isAndroidNative)) {
      handlePlayStorePurchase();
      return;
    }

    // If Stripe is selected, use Stripe Checkout
    if (selectedPaymentMethod === 'stripe') {
      handleStripePurchase();
      return;
    }

    // Check if payment method is selected for local payment
    if (!selectedPaymentType && helperPaymentMethods.length > 0) {
      toast({
        title: "Select Payment Method",
        description: "Please select a payment method (bKash, Nagad, etc.) first",
        variant: "destructive"
      });
      return;
    }

    // Filter helper methods by selected payment type
    const filteredMethods = helperPaymentMethods.filter(
      m => m.method_name.toLowerCase() === selectedPaymentType?.toLowerCase()
    );

    if (filteredMethods.length > 0) {
      const selectedMethod =
        currentHelperMethod &&
        currentHelperMethod.method_name.toLowerCase() === selectedPaymentType?.toLowerCase()
          ? currentHelperMethod
          : filteredMethods[0];

      if (!selectedMethod) {
        toast({
          title: "No Helper Available",
          description: "No payment helper available for this method.",
          variant: "destructive"
        });
        return;
      }

      setSelectedHelperMethod(selectedMethod);
      console.log('[Recharge] Selected helper for manual payment:', selectedMethod.helper?.user?.display_name || 'Unknown helper');
      
      setHelperPaymentStep("form");
      setShowHelperPaymentModal(true);
      return;
    }

    // Fallback to gateway payment if no helper methods available
    if (!selectedGateway) {
      setShowGatewayModal(true);
      return;
    }

    // Show payment form modal
    setPaymentStep("form");
    setShowPaymentModal(true);
  };

  const handleSubmitPayment = async () => {
    if (!selectedPackage || !selectedGateway || !userId) {
      toast({
        title: "Error",
        description: "Missing required information",
        variant: "destructive"
      });
      return;
    }

    if (!transactionId.trim()) {
      toast({
        title: "Transaction ID Required",
        description: "Please enter your payment transaction ID",
        variant: "destructive"
      });
      return;
    }

    setProcessingPayment(true);
    setPaymentStep("processing");

    try {
      const transactionRef = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const localAmount = selectedPackage.price_usd * (currencyRate?.rate_to_usd || 1);

      // Check if user is paying via merchant/helper wallet (country-based rotating helper)
      if (currentHelperMethod && currentHelperMethod.helper) {
        // Create helper order for instant processing
        const helper = currentHelperMethod.helper as any;
        
        // Check if helper has sufficient balance
        if (helper.wallet_balance < selectedPackage.coins) {
          throw new Error("Merchant doesn't have enough diamonds. Please try another payment method.");
        }

        // Create helper order with correct schema
        const { data: helperOrder, error: orderError } = await supabase
          .from('helper_orders')
          .insert({
            helper_id: helper.id,
            user_id: userId,
            coin_amount: selectedPackage.coins,
            amount_usd: selectedPackage.price_usd,
            amount_local: localAmount,
            currency_code: currencyRate?.currency_code || 'USD',
            user_country_code: userCountryCode,
            payment_method: currentHelperMethod.method_name,
            user_payment_proof: paymentProof,
            status: 'completed', // Instant approval!
            processed_at: new Date().toISOString(),
            payment_details: {
              transaction_id: transactionId,
              gateway: selectedGateway.name,
              auto_approved: true
            }
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // ATOMIC: Deduct diamonds from helper (prevents race conditions & negative balance)
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_helper_wallet', {
            _helper_id: helper.id,
            _amount: selectedPackage.coins,
            _update_total_sold: true
          });

        if (deductError) {
          console.error('Failed to deduct from helper:', deductError);
          recordClientError({ label: "Recharge.helper", message: deductError instanceof Error ? deductError.message : String(deductError) });
          throw new Error('Failed to deduct diamonds from merchant');
        }

        // Check if deduction was successful (insufficient balance check)
        const deductData = deductResult as any;
        if (deductData && deductData.success === false) {
          throw new Error(deductData.error || "Merchant doesn't have enough diamonds");
        }

        // Calculate total coins with first recharge bonus
        const bonusCoins = isFirstRecharge && selectedPackage.bonus_percentage > 0
          ? Math.floor(selectedPackage.coins * selectedPackage.bonus_percentage / 100)
          : 0;
        const totalCoinsToAdd = selectedPackage.coins + bonusCoins;

        // ATOMIC: Add diamonds to user (base + bonus) - helper-safe RPC
        const { data: addResult, error: addError } = await supabase
          .rpc('helper_add_coins_to_user', {
            _user_id: userId,
            _amount: totalCoinsToAdd
          });

        if (addError) {
          console.error('Failed to add to user:', addError);
          recordClientError({ label: "Recharge.totalCoinsToAdd", message: addError instanceof Error ? addError.message : String(addError) });
        }
        const addData = addResult as any;
        if (addData && addData.success === false) {
          console.error('Add coins failed:', addData.error);
          recordClientError({ label: "Recharge.addData", message: addData.error instanceof Error ? addData.error.message : String(addData.error) });
        }

        // If first recharge, record the claim
        if (isFirstRecharge && bonusCoins > 0) {
          await supabase.from('first_recharge_claims').insert({
            user_id: userId,
            package_id: selectedPackage.id,
            original_coins: selectedPackage.coins,
            bonus_coins: bonusCoins,
            total_coins: totalCoinsToAdd,
          }).then(() => setIsFirstRecharge(false));
        }

        // Notify user
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'payment_completed',
          title: '🎉 Diamonds Added!',
          message: `${formatNumber(totalCoinsToAdd)} diamonds have been added to your account instantly!${bonusCoins > 0 ? ` (includes +${bonusCoins} first recharge bonus!)` : ''}`,
          data: {
            order_id: helperOrder.id,
            diamonds: totalCoinsToAdd
          }
        });

        // Helper notification is handled automatically by DB trigger (notify_helper_on_new_order)

        toast({
          title: "🎉 Instant Success!",
          description: `${formatNumber(totalCoinsToAdd)} diamonds added to your account!${bonusCoins > 0 ? ` (+${formatNumber(bonusCoins)} bonus!)` : ''}`,
        });

        // Mark campaign as purchased if navigated from campaign
        if (campaignId) localStorage.setItem('campaign_purchased_' + campaignId, 'true');

        // Update local balance
        updateCachedBalance(currentBalance + totalCoinsToAdd);
        
        // Show success and close
        setPaymentStep("pending");
        return;
      }

      // Standard payment flow - create transaction record
      const { data: transaction, error } = await supabase
        .from('payment_transactions')
        .insert({
          user_id: userId,
          gateway_id: selectedGateway.id,
          package_id: selectedPackage.id,
          transaction_ref: transactionRef,
          gateway_transaction_id: transactionId,
          amount_usd: selectedPackage.price_usd,
          amount_local: localAmount,
          currency_code: currencyRate?.currency_code || 'USD',
          coins_to_receive: isFirstRecharge && selectedPackage.bonus_percentage > 0
            ? Math.floor(selectedPackage.coins + (selectedPackage.coins * selectedPackage.bonus_percentage / 100))
            : selectedPackage.coins,
          status: 'pending',
          payment_data: {
            gateway_code: selectedGateway.gateway_code,
            package_coins: selectedPackage.coins,
            bonus_percentage: selectedPackage.bonus_percentage,
            is_first_recharge: isFirstRecharge,
            bonus_coins: isFirstRecharge && selectedPackage.bonus_percentage > 0
              ? Math.floor(selectedPackage.coins * selectedPackage.bonus_percentage / 100)
              : 0,
            sender_number: senderNumber,
            payment_proof_url: paymentProof,
            user_transaction_id: transactionId
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for admin about new payment
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'payment_pending',
        title: '💳 New Payment Pending',
        message: `Payment of ${convertToLocalCurrency(selectedPackage.price_usd)} for ${formatNumber(selectedPackage.coins)} diamonds is awaiting approval.`,
        data: {
          transaction_id: transaction.id,
          amount: localAmount,
          coins: selectedPackage.coins,
          gateway: selectedGateway.name
        }
      });

      // Show pending status
      setPaymentStep("pending");

    } catch (error: any) {
      console.error('Payment error:', error);
      recordClientError({ label: "Recharge.addData", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Payment Failed",
        description: error.message || "Could not process payment. Please try again.",
        variant: "destructive"
      });
      setPaymentStep("form");
    } finally {
      setProcessingPayment(false);
    }
  };

  const resetPaymentForm = () => {
    setShowPaymentModal(false);
    setPaymentStep("select");
    setTransactionId("");
    setSenderNumber("");
    setPaymentProof(null);
    setSelectedPackageId(null);
  };

  // Helper Payment Functions
  const handleUploadHelperProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingHelperProof(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `helper-payment-proof-${userId}-${Date.now()}.${fileExt}`;
      const filePath = `payment-proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filePath);

      setHelperPaymentProof(publicUrl);
      toast({
        title: "Uploaded!",
        description: "Payment proof uploaded successfully",
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      recordClientError({ label: "Recharge.filePath", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Upload Failed",
        description: "Could not upload payment proof. Try again.",
        variant: "destructive"
      });
    } finally {
      setUploadingHelperProof(false);
    }
  };

  const handleHelperPaymentSubmit = async () => {
    if (!selectedPackage || !selectedHelperMethod || !userId) {
      toast({
        title: "Error",
        description: "Missing required information",
        variant: "destructive"
      });
      return;
    }

    if (!helperTransactionId.trim()) {
      toast({
        title: "Transaction ID Required",
        description: "Please enter your payment transaction ID",
        variant: "destructive"
      });
      return;
    }

    setHelperPaymentProcessing(true);
    setHelperPaymentStep("processing");

    try {
      const localAmount = selectedPackage.price_usd * (currencyRate?.rate_to_usd || 1);
      const gwType = selectedHelperMethod.additional_info?.gateway_type;
      
      if (gwType === 'zinipay') {
        // ZiniPay IN-APP FLOW: Create session → user pays manually → enters TrxID → auto-verify via IPN
        const { data, error } = await supabase.functions.invoke('create-zinipay-payment', {
          body: {
            package_id: selectedPackage.id,
            payment_method_id: selectedHelperMethod.id,
            origin_url: window.location.origin,
            transaction_id: helperTransactionId.trim(),
            payment_proof: helperPaymentProof,
            skip_redirect: true, // IN-APP mode — no redirect to ZiniPay page
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || 'ZiniPay payment failed');
        }

        // Show success and poll for verification
        toast({
          title: "⚡ Order Created!",
          description: "Verifying transaction... Please wait 5-10 seconds.",
        });
        
        setHelperPaymentStep("pending");
        
        // Poll for order completion (IPN webhook will update the status)
        if (data?.order_id) {
          let attempts = 0;
          const maxAttempts = 12; // 60 seconds total
          const pollInterval = setInterval(async () => {
            attempts++;
            try {
              // Try server-side ZiniPay API verification on each poll
              if (attempts <= 6) {
                try {
                  await supabase.functions.invoke("verify-zinipay-payment", {
                    body: { order_id: data.order_id },
                  });
                } catch { /* ignore verify errors */ }
              }

              const { data: orderStatus } = await supabase
                .from('helper_orders')
                .select('status')
                .eq('id', data.order_id)
                .single();
              
              if (orderStatus?.status === 'completed') {
                clearInterval(pollInterval);
                toast({
                  title: "✅ Diamonds Added!",
                  description: `${formatNumber(selectedPackage.coins)} 💎 has been added to your account!`,
                });
                resetHelperPaymentForm();
              } else if (orderStatus?.status === 'failed') {
                clearInterval(pollInterval);
                toast({
                  title: "❌ Payment Failed",
                  description: "Payment could not be verified. Please try again.",
                  variant: "destructive",
                });
                setHelperPaymentStep("form");
              } else if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                toast({
                  title: "⏳ Verification in Progress",
                  description: "Verification is taking a moment. The helper will process it manually.",
                });
              }
            } catch {
              // Ignore polling errors
            }
          }, 5000);
        }
      } else {
        // Manual helper order
        const { data: order, error: orderError } = await supabase
          .from('helper_orders')
          .insert({
            helper_id: selectedHelperMethod.helper_id,
            user_id: userId,
            coin_amount: selectedPackage.coins,
            amount_usd: selectedPackage.price_usd,
            amount_local: localAmount,
            currency_code: currencyRate?.currency_code || 'USD',
            payment_method: selectedHelperMethod.method_name,
            user_country_code: userCountryCode,
            package_id: selectedPackage.id,
            user_payment_proof: helperPaymentProof,
            payment_details: {
              transaction_id: helperTransactionId,
              message: helperMessage || null,
              method_type: selectedHelperMethod.method_type,
              account_name: selectedHelperMethod.account_name,
              account_number: selectedHelperMethod.account_number
            },
            status: 'pending'
          })
          .select()
          .single();

        if (orderError) throw orderError;

        setHelperPaymentStep("pending");
        toast({
          title: "Order Submitted!",
          description: "Helper will process your order shortly",
        });
      }

    } catch (error: any) {
      console.error('Helper payment error:', error);
      recordClientError({ label: "Recharge.pollInterval", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Payment Failed",
        description: error.message || "Could not process payment. Please try again.",
        variant: "destructive"
      });
      setHelperPaymentStep("form");
    } finally {
      setHelperPaymentProcessing(false);
    }
  };

  const resetHelperPaymentForm = () => {
    setShowHelperPaymentModal(false);
    setHelperPaymentStep("select");
    setHelperTransactionId("");
    setHelperMessage("");
    setHelperPaymentProof(null);
    setSelectedHelperMethod(null);
    setSelectedPackageId(null);
  };

  // currentHelperMethod is now defined at the top of the component

  const tabs = [
    { id: "google" as TabType, label: "💎 Diamonds", icon: <Diamond className="w-4 h-4" /> },
    { id: "recommend" as TabType, label: "🎁 Offers", icon: <Star className="w-4 h-4" /> },
    { id: "helper" as TabType, label: "👥 Helpers", icon: <Crown className="w-4 h-4" /> },
  ];

  const availableGateways = gateways.filter(g => 
    !currencyRate || g.supported_currencies.includes(currencyRate.currency_code) || g.supported_currencies.includes('USD')
  );

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'linear-gradient(180deg, #2d1045 0%, #1a0a2e 30%, #0d0618 100%)' }}>
      {/* Premium Header */}
      <div className="relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-primary" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
        
        <header className="relative safe-area-top">
          <div className="flex items-center justify-between px-4 py-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-white hover:bg-white/20 w-10 h-10"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-white font-bold text-lg">Diamond Store</h1>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-white hover:bg-white/20 w-10 h-10"
              onClick={() => navigate('/recharge-history')}
            >
              <FileText className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Compact Balance Display */}
        <div className="relative px-3 pt-1 pb-4">
          <div className="relative bg-white/15 backdrop-blur-xl rounded-xl p-3 border border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <Diamond3DIcon size={24} />
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] font-medium">Your Balance</p>
                  <span className="text-xl font-bold text-white">
                    {formatNumber(currentBalance)}
                  </span>
                </div>
              </div>
              
              {currencyRate && (
                <div className="bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-right">
                  <p className="text-slate-700 text-[9px] font-medium">Currency</p>
                  <p className="text-white font-bold text-sm">
                    {currencyRate.currency_symbol} {currencyRate.currency_code}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Tabs */}
        <div className="relative px-3 pb-2">
          <div className="flex gap-1 bg-white/10 backdrop-blur-sm rounded-lg p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={cn(
                  "flex-1 py-2 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1",
                  selectedTab === tab.id
                    ? "bg-white text-primary shadow-md"
                    : "text-slate-600 hover:text-white hover:bg-white/10"
                )}
              >
                {tab.icon}
                <span className="hidden xs:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Content - Mobile Optimized with Bottom Nav Safe Area */}
        {/* First Recharge Bonus Banner - Animated */}
        {isFirstRecharge && (
          <div className="mx-0 mb-3 relative overflow-hidden rounded-xl shadow-lg shadow-amber-500/20" style={{ height: '80px' }}>
            {rechargeBannerConfig.banner_image_url && rechargeBannerConfig.banner_type === 'image' ? (
              <img 
                src={rechargeBannerConfig.banner_image_url} 
                alt="First Recharge Bonus" 
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <>
                {/* Animated gradient background */}
                <div 
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'linear-gradient(135deg, #1a0a2e 0%, #16082b 20%, #2d1045 40%, #1a0a2e 60%, #0d0618 100%)',
                  }}
                />
                
                {/* Moving shimmer effect */}
                <div 
                  className="absolute inset-0 rounded-xl opacity-30"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.15) 25%, rgba(255,165,0,0.2) 50%, rgba(255,215,0,0.15) 75%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmerBanner 3s ease-in-out infinite',
                  }}
                />

                {/* Floating particles */}
                {bonusParticles.map((particle, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: `${particle.size}px`,
                      height: `${particle.size}px`,
                      background: particle.color,
                      left: particle.left,
                      top: particle.top,
                      animationName: 'floatParticle',
                      animationDuration: particle.duration,
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: particle.delay,
                      opacity: particle.opacity,
                      filter: 'blur(0.5px)',
                      boxShadow: '0 0 4px rgba(255,215,0,0.6)',
                    }}
                  />
                ))}

                {/* Left: 3D Treasure Chest */}
                <div className="absolute left-1 top-1/2 -translate-y-1/2">
                  <div className="relative" style={{ animation: 'bounceChest 2.5s ease-in-out infinite' }}>
                    <img src={treasureChest3D} alt="Gift Box" style={{ width: '72px', height: '72px', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(139,92,246,0.5))' }} />
                  </div>
                </div>

                {/* Center text */}
                <div className="absolute inset-0 flex items-center justify-center flex-col" style={{ paddingLeft: '70px' }}>
                  <p 
                    className="text-lg font-black tracking-widest uppercase"
                    style={{
                      background: 'linear-gradient(135deg, #FFF8DC 0%, #FFD700 25%, #FFFFFF 50%, #FFD700 75%, #FFA500 100%)',
                      backgroundSize: '200% 100%',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8)) drop-shadow(0 2px 4px rgba(255,165,0,0.6))',
                      animation: 'shimmerBanner 3s linear infinite',
                      letterSpacing: '0.12em',
                    }}
                  >
                    {rechargeBannerConfig.banner_title || 'FIRST RECHARGE BONUS'}
                  </p>
                  <p 
                    className="text-[10px] mt-0.5 tracking-wider font-semibold"
                    style={{
                      background: 'linear-gradient(90deg, #e8d5b0 0%, #fff 50%, #e8d5b0 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      opacity: 0.85,
                    }}
                  >
                    {rechargeBannerConfig.banner_subtitle || 'Get extra bonus diamonds on your first purchase'}
                  </p>
                </div>
              </>
            )}
            {/* Glow border with animation */}
            <div 
              className="absolute inset-0 rounded-xl"
              style={{
                border: '1px solid transparent',
                background: 'linear-gradient(var(--angle, 0deg), rgba(255,215,0,0.4), rgba(255,165,0,0.1), rgba(255,215,0,0.4)) border-box',
                mask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
                WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                animation: 'rotateBorder 4s linear infinite',
              }}
            />
          </div>
        )}

        <style>{`
          @keyframes shimmerBanner {
            0%, 100% { background-position: -200% 0; }
            50% { background-position: 200% 0; }
          }
          @keyframes floatParticle {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
            50% { transform: translateY(-12px) scale(1.3); opacity: 1; }
          }
          @keyframes bounceChest {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-4px) scale(1.08); }
          }
          @keyframes glowText {
            0% { filter: drop-shadow(0 1px 2px rgba(255,165,0,0.3)); }
            100% { filter: drop-shadow(0 1px 8px rgba(255,215,0,0.6)); }
          }
          @keyframes floatDiamond {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            25% { transform: translateY(-4px) rotate(3deg); }
            75% { transform: translateY(2px) rotate(-2deg); }
          }
          @keyframes pulseGlow {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.15); }
          }
          @keyframes rotateBorder {
            0% { --angle: 0deg; }
            100% { --angle: 360deg; }
          }
          @property --angle {
            syntax: '<angle>';
            initial-value: 0deg;
            inherits: false;
          }
        `}</style>

      <main 
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)',
          background: 'linear-gradient(180deg, #f8f4ff 0%, #ffffff 40%, #fff5f7 100%)',
        }}
      >
        {selectedTab === "helper" ? (
          <div>
            {/* Country Header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl mb-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 shadow-sm">
              <span className="text-xl">{topUpHelpers[0]?.countryFlag || geoLocation.countryFlag || '🌍'}</span>
              <div className="flex-1">
                <h3 className="font-bold text-sm text-amber-700">
                  {topUpHelpers[0]?.countryName || geoLocation.country || 'Your Country'} — Verified Traders
                </h3>
                <p className="text-[10px] text-amber-600/70">Tap "Message" to buy diamonds. Your UID is sent automatically.</p>
              </div>
            </div>

            {topUpHelpers.length > 0 ? (
              (() => {
                const pageSize = 5;
                const visibleHelpers = topUpHelpers.slice(helperRotationPage * pageSize, (helperRotationPage + 1) * pageSize);
                return (
                  <div className="space-y-2.5">
                    {visibleHelpers.map((helper, idx) => {
                      const levelColors = helper.traderLevel >= 4
                        ? "from-amber-500 to-yellow-500" 
                        : helper.traderLevel >= 3 
                          ? "from-purple-500 to-pink-500" 
                          : "from-blue-500 to-cyan-500";
                      const globalRank = helperRotationPage * pageSize + idx + 1;
                      return (
                         <div key={helper.id} className="relative bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all overflow-hidden">
                          <div className={cn("h-1 bg-gradient-to-r", levelColors)} />
                          <div className="flex items-center gap-3 p-3">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              globalRank <= 3 ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow" : "bg-gray-100 text-slate-700"
                            )}>
                              {globalRank <= 3 ? ['🥇','🥈','🥉'][globalRank-1] : `#${globalRank}`}
                            </div>
                            <div className="relative shrink-0">
                              <img src={helper.avatar || '/placeholder.svg'} alt={helper.name} loading="eager" decoding="async" className="w-11 h-11 rounded-xl object-cover ring-2 ring-amber-200" />
                              <div className={cn("absolute -top-1 -left-1 px-1 py-0.5 rounded text-[8px] font-bold text-white shadow bg-gradient-to-r", levelColors)}>
                                Lv.{helper.traderLevel}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-gray-800 text-sm truncate">{helper.name}</h3>
                                <Badge className={cn("text-[8px] font-bold border-0 text-white bg-gradient-to-r px-1.5 py-0", levelColors)}>Trader</Badge>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] font-medium ${helper.isOnline ? 'text-green-500' : 'text-gray-200'}`}>
                                  {helper.isOnline ? '● Online' : '○ Offline'}
                                </span>
                                {helper.appUid && <span className="text-[10px] text-gray-200">ID: {helper.appUid}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-orange-600 font-semibold">
                                  🛒 {helper.totalSold > 0 ? `${(helper.totalSold / 1000).toFixed(0)}K sold` : 'New trader'}
                                </span>
                              </div>
                              {/* WhatsApp Number Display */}
                              {helper.whatsappNumber && (
                                <div className="flex items-center gap-1 mt-1">
                                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                  <span className="text-[10px] text-green-600 font-medium">{helper.whatsappNumber}</span>
                                </div>
                              )}
                              {/* Accepted payment method logos (tick-marked by helper) */}
                              {helper.acceptedMethods && helper.acceptedMethods.length > 0 && (
                                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                  <span className="text-[9px] text-slate-700 font-medium">Accepts:</span>
                                  {helper.acceptedMethods.slice(0, 6).map((m) => {
                                    const resolved = resolveMethodLogo(m.logo_url, m.name);
                                    return (
                                      <div
                                        key={m.gateway_id}
                                        title={`${m.name}${m.is_integrated ? ' (Auto)' : ' (Manual)'}`}
                                        className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center overflow-hidden"
                                      >
                                        {resolved ? (
                                          <img
                                            src={resolved}
                                            alt={m.name}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                          />
                                        ) : (
                                          <span className="text-[8px] font-bold text-gray-600">{m.name.charAt(0)}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {helper.acceptedMethods.length > 6 && (
                                    <span className="text-[9px] text-slate-700 font-bold">+{helper.acceptedMethods.length - 6}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {helper.whatsappNumber && (
                                <a
                                  href={`https://wa.me/${helper.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(userAppUid ? `Hi, I want to buy coins. My UID: ${userAppUid}` : 'Hi, I want to buy coins.')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                                >
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                  <span>WhatsApp</span>
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  const autoMsg = userAppUid ? `Hi, I want to buy coins. My UID: ${userAppUid}` : `Hi, I want to buy coins.`;
                                  navigate(`/chat?user=${helper.id}&autoMessage=${encodeURIComponent(autoMsg)}`);
                                }}
                                className="flex items-center gap-1 px-2.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-[11px] font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Chat</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-12">
                <Crown className="w-12 h-12 mx-auto mb-3 text-purple-200" />
                <p className="font-semibold text-gray-600">No traders available</p>
                <p className="text-xs mt-1 text-gray-200">
                  No verified traders found for {geoLocation.country || 'your country'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Compact Payment Method Selection */}
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Wallet className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Payment Method</span>
              </div>
              
              {/* Ultra Compact Payment Cards */}
              <div className="flex gap-2 flex-wrap">
                {/* Google Play */}
                <button
                  onClick={() => setSelectedPaymentMethod('playstore')}
                  className={cn(
                    "flex-1 min-w-[130px] relative overflow-hidden rounded-2xl p-3 transition-all duration-200",
                    selectedPaymentMethod === 'playstore'
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-green-500/25"
                      : "bg-white border-2 border-gray-100 hover:border-green-400/50 shadow-sm"
                  )}
                >
                  <div className="relative flex items-center gap-2">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-base",
                      selectedPaymentMethod === 'playstore' ? "bg-white/20" : "bg-green-50"
                    )}>
                      🎮
                    </div>
                    <div className="flex-1 text-left">
                      <p className={cn(
                        "font-bold text-[13px]",
                        selectedPaymentMethod === 'playstore' ? "text-white" : "text-gray-800"
                      )}>
                        Google Play
                      </p>
                      <p className={cn(
                        "text-[10px] font-medium",
                        selectedPaymentMethod === 'playstore' ? "text-slate-600" : "text-slate-700"
                      )}>
                        Worldwide • Instant
                      </p>
                    </div>
                    {selectedPaymentMethod === 'playstore' && (
                      <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
                
                {/* Stripe - International Payments */}
                {!isBangladesh && (
                  <button
                    onClick={() => setSelectedPaymentMethod('stripe')}
                    className={cn(
                      "flex-1 min-w-[130px] relative overflow-hidden rounded-2xl p-3 transition-all duration-200",
                      selectedPaymentMethod === 'stripe'
                        ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25"
                        : "bg-white border-2 border-gray-100 hover:border-indigo-400/50 shadow-sm"
                    )}
                  >
                    <div className="relative flex items-center gap-2">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center text-base",
                        selectedPaymentMethod === 'stripe' ? "bg-white/20" : "bg-indigo-50"
                      )}>
                        💳
                      </div>
                      <div className="flex-1 text-left">
                        <p className={cn(
                          "font-bold text-[13px]",
                          selectedPaymentMethod === 'stripe' ? "text-white" : "text-gray-800"
                        )}>
                          {(() => {
                            const cc = userCountryCode?.toUpperCase();
                            if (cc === 'IN') return 'UPI / Card';
                            if (cc === 'PH') return 'GCash / Card';
                            if (cc === 'MY') return 'FPX / Card';
                            if (cc === 'TH') return 'PromptPay';
                            if (cc === 'BR') return 'PIX / Card';
                            return 'Card Pay';
                          })()}
                        </p>
                        <p className={cn(
                          "text-[10px] font-medium",
                          selectedPaymentMethod === 'stripe' ? "text-slate-600" : "text-slate-700"
                        )}>
                          ⚡ Instant • Secure
                        </p>
                      </div>
                      {selectedPaymentMethod === 'stripe' && (
                        <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                )}
                
                {/* Recommend - ALWAYS show for BD/IN/PK users regardless of helper data */}
                {/* Force show: true = always visible for testing/supported regions */}
                {/* Recommend - Only show if there are helper methods for user's country OR show as disabled */}
                {(
                  <button
                    onClick={() => setSelectedPaymentMethod('local')}
                    className={cn(
                      "flex-1 min-w-[130px] relative overflow-hidden rounded-2xl p-3 transition-all duration-200",
                      selectedPaymentMethod === 'local'
                        ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/25"
                        : "bg-white border-2 border-gray-100 hover:border-orange-400/50 shadow-sm"
                    )}
                  >
                    <div className="relative flex items-center gap-2">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center text-base",
                        selectedPaymentMethod === 'local' ? "bg-white/20" : "bg-orange-50"
                      )}>
                        ⭐
                      </div>
                      <div className="flex-1 text-left">
                        <p className={cn(
                          "font-bold text-[13px]",
                          selectedPaymentMethod === 'local' ? "text-white" : "text-gray-800"
                        )}>
                          Recommend
                        </p>
                        <p className={cn(
                          "text-[10px] truncate max-w-[70px] font-medium",
                          selectedPaymentMethod === 'local' ? "text-slate-600" : "text-slate-700"
                        )}>
                          {helperPaymentMethods.length > 0 
                            ? Array.from(new Set(helperPaymentMethods.map(m => m.method_name.toLowerCase()))).slice(0, 2).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')
                            : 'Local Pay'}
                        </p>
                      </div>
                      {selectedPaymentMethod === 'local' && (
                        <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Recommend Payment Methods - Level 5 Helper Methods (Local Pay) */}
            {selectedPaymentMethod === 'local' && (
              <div className="mb-2">
                {helperPaymentMethods.length > 0 ? (
                  <>
                    {/* Payment Method Type Selector with Helper's Uploaded Logos */}
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(new Set(helperPaymentMethods.map(m => m.method_name.toLowerCase()))).map((methodType) => {
                        const isSelected = selectedPaymentType === methodType;
                        // 1) Try helper's own uploaded logo
                        const methodData = helperPaymentMethods.find(m => m.method_name.toLowerCase() === methodType);
                        const logoUrl = resolveMethodLogo(methodData?.logo_url, methodType);
                        
                        // Fallback colors based on payment type
                        const getPaymentColors = (type: string) => {
                          const lowerType = type.toLowerCase();
                          if (lowerType === 'bkash') return { color: 'from-pink-500 to-pink-600', bg: 'bg-pink-500/10' };
                          if (lowerType === 'nagad') return { color: 'from-orange-500 to-red-500', bg: 'bg-orange-500/10' };
                          if (lowerType === 'rocket') return { color: 'from-purple-500 to-purple-600', bg: 'bg-purple-500/10' };
                          if (lowerType === 'paytm') return { color: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10' };
                          if (lowerType === 'phonepe') return { color: 'from-purple-500 to-indigo-600', bg: 'bg-purple-500/10' };
                          if (lowerType === 'jazzcash') return { color: 'from-red-500 to-red-600', bg: 'bg-red-500/10' };
                          if (lowerType === 'easypaisa') return { color: 'from-green-500 to-green-600', bg: 'bg-green-500/10' };
                          return { color: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10' };
                        };
                        
                        const colors = getPaymentColors(methodType);
                        
                        return (
                          <button
                            key={methodType}
                            onClick={() => setSelectedPaymentType(methodType)}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold transition-all border-2",
                              isSelected
                                ? `bg-gradient-to-r ${colors.color} text-white shadow-lg border-transparent`
                                : `bg-white ${colors.bg} border-gray-100 text-gray-700 hover:shadow-md`
                            )}
                          >
                            {logoUrl ? (
                              <img 
                                src={logoUrl} 
                                alt={methodType} 
                                className="w-5 h-5 rounded object-cover"
                                onError={(e) => {
                                  (e.currentTarget.style.display = 'none');
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <span className={cn("text-sm font-black leading-none", logoUrl && "hidden")}>{paymentBrandFallback(methodType)}</span>
                            <span className="capitalize">
                              {methodType}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected method number is hidden here; it will show only after package click */}
                  </>
                ) : (
                  /* Loading or No helpers state */
                  <div className="flex flex-col items-center justify-center py-6 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🌍</span>
                      <span className="text-sm font-medium text-gray-600">
                        {userCountryCode ? `No local methods for ${geoLocation.country || userCountryCode}` : 'Detecting location...'}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-200 text-center px-4">
                      {userCountryCode 
                        ? 'Local payment helpers are not available in your region. Please use Google Play or contact support.'
                        : 'Please wait while we detect your location...'}
                    </p>
                    {!userCountryCode && (
                      <RefreshCw className="w-4 h-4 text-gray-200 animate-spin mt-2" />
                    )}
                    </div>
                )}
              </div>
            )}

            {/* Play Store Info - Mini Banner */}
            {selectedPaymentMethod === 'playstore' && (
              <div className={cn(
                "mb-3 rounded-xl p-2.5 border",
                isPlayStoreAvailable 
                  ? "bg-emerald-50 border-emerald-200" 
                  : "bg-blue-50 border-blue-200"
              )}>
                <div className="flex items-center gap-2">
                  {isPlayStoreAvailable ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <p className="text-[11px] text-emerald-700 font-semibold">✓ Instant ✓ Secure ✓ Worldwide ✓ No TxID needed</p>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <p className="text-[11px] text-blue-700 font-semibold">
                        📲 Download Android app for instant Google Play payments
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Stripe Info - Country-Specific Mini Banner */}
            {!isBangladesh && selectedPaymentMethod === 'stripe' && (
              <div className="mb-3 rounded-xl p-2.5 border bg-indigo-50 border-indigo-200">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <p className="text-[11px] text-indigo-700 font-semibold">
                    {(() => {
                      const cc = userCountryCode?.toUpperCase();
                      if (cc === 'IN') return '💳 Card, UPI • ⚡ Instant • Secure';
                      if (cc === 'PH') return '💳 Card, GCash, GrabPay • ⚡ Instant';
                      if (cc === 'MY') return '💳 Card, FPX, GrabPay • ⚡ Instant';
                      if (cc === 'TH') return '💳 Card, PromptPay • ⚡ Instant';
                      if (cc === 'BR') return '💳 Card, PIX, Boleto • ⚡ Instant';
                      if (cc === 'MX') return '💳 Card, OXXO • ⚡ Instant';
                      if (cc === 'US') return '💳 Card, CashApp, Amazon Pay • ⚡ Instant';
                      if (cc === 'DE' || cc === 'AT') return '💳 Card, Klarna, Giropay, SOFORT • ⚡ Instant';
                      if (cc === 'JP') return '💳 Card, Konbini • ⚡ Instant';
                      return '💳 Visa, Mastercard, Apple Pay, Google Pay • ⚡ Instant';
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Packages Grid - Compact */}
            <div className="grid grid-cols-2 gap-3">
              {packages.map((pkg) => {
                // Handle direct purchase when clicking price button
                const handlePurchaseClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setSelectedPackageId(pkg.id);
                  
                  // Trigger payment flow immediately
                  if (selectedPaymentMethod === 'playstore') {
                      const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
                      if (isPlayStoreAvailable || isAndroid) {
                      // For Play Store, directly initiate purchase
                      setPlayStoreProcessing(true);
                      const productId = playStoreBilling.getProductIdForCoins(pkg.coins);
                      if (productId && userId) {
                        playStoreBilling.purchase(productId, userId).then(result => {
                          if (result.success) {
                            fetchUserData();
                            toast({
                              title: "🎉 Purchase Successful!",
                              description: `${formatNumber(pkg.coins)} diamonds added to your account`,
                            });
                          } else {
                            toast({
                              title: "Purchase Failed",
                              description: result.error || "Could not complete purchase. Please try again.",
                              variant: "destructive"
                            });
                          }
                          setPlayStoreProcessing(false);
                        }).catch(err => {
                          console.error('[Recharge] Play Store purchase error:', err);
                          recordClientError({ label: "Recharge.productId", message: err instanceof Error ? err.message : String(err) });
                          toast({
                            title: "Purchase Error",
                            description: err.message || "An error occurred during purchase",
                            variant: "destructive"
                          });
                          setPlayStoreProcessing(false);
                        });
                      } else {
                        toast({
                          title: "Product Not Available",
                          description: "This package is not available for Play Store purchase",
                          variant: "destructive"
                        });
                        setPlayStoreProcessing(false);
                      }
                    } else {
                      // Play Store not available - show appropriate message
                      if (isAndroid) {
                        // On Android but Play Store plugin not initialized
                        toast({
                          title: "Play Store Unavailable",
                          description: "Google Play Store is not available. Please use local payment methods.",
                          variant: "destructive"
                        });
                      } else {
                        // On Web/iOS - show info that Play Store requires Android app
                        toast({
                          title: "📲 Download Android App",
                          description: "Google Play payment requires the Android app. Please download from Play Store for instant payments.",
                        });
                      }
                    }
                  } else if (selectedPaymentMethod === 'stripe') {
                    if (isBangladesh) {
                      toast({
                        title: "Card Payment Unavailable",
                        description: "Card Payment is not available in Bangladesh. Please use a local method.",
                        variant: "destructive"
                      });
                      return;
                    }
                    // Stripe payment - invoke directly
                    setStripeProcessing(true);
                    supabase.functions.invoke("create-stripe-payment", {
                      body: { package_id: pkg.id, origin_url: window.location.origin, country_code: userCountryCode },
                    }).then(({ data, error }) => {
                      if (error || data?.error) {
                        toast({
                          title: "Payment Error",
                          description: data?.error || error?.message || "Could not start payment",
                          variant: "destructive"
                        });
                      } else if (data?.url) {
                        import("@/utils/inAppNavigation").then(({ openInApp }) => openInApp(data.url, { useOverlay: true }));
                      }
                      setStripeProcessing(false);
                    }).catch(err => {
                      console.error('[Recharge] Stripe error:', err);
                      recordClientError({ label: "Recharge.isAndroid", message: err instanceof Error ? err.message : String(err) });
                      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
                      setStripeProcessing(false);
                    });
                  } else if (selectedPaymentMethod === 'local' || selectedPaymentMethod === 'helper') {
                    // Level 5 Helper payment methods (Recommend tab = 'local', Helper tab = 'helper')
                    if (helperPaymentMethods.length > 0) {
                      if (!selectedPaymentType) {
                        toast({
                          title: "Select Payment Method",
                          description: "Please select a payment method (bKash, Nagad, etc.) first",
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      const selectedMethod = selectBalancedLocalMethod();

                      if (selectedMethod) {
                        // Check if this is a gateway method (SSLCommerz/AamarPay/ZiniPay)
                        const gwType = selectedMethod.additional_info?.gateway_type;
                        if (isAutoGatewayMethod(selectedMethod) && gwType) {
                          if (gwType === 'zinipay') {
                            // ZiniPay: Show in-app modal with single rotated number (no redirect)
                            setSelectedHelperMethod(selectedMethod);
                            setHelperPaymentStep("form");
                            setShowHelperPaymentModal(true);
                            return;
                          }
                          // Other auto gateways (SSLCommerz/AamarPay) use redirect flow
                          const edgeFn = 'create-local-payment';
                          setStripeProcessing(true);
                          supabase.functions.invoke(edgeFn, {
                            body: { 
                              package_id: pkg.id, 
                              payment_method_id: selectedMethod.id,
                              origin_url: window.location.origin,
                            },
                          }).then(({ data, error }) => {
                            if (error || data?.error) {
                              toast({
                                title: "Payment Error",
                                description: data?.error || error?.message || "Could not start payment",
                                variant: "destructive"
                              });
                            } else if (data?.url) {
                              import("@/utils/inAppNavigation").then(({ openInApp }) => openInApp(data.url, { useOverlay: true }));
                            }
                            setStripeProcessing(false);
                          }).catch(err => {
                            console.error('[Recharge] Gateway payment error:', err);
                            recordClientError({ label: "Recharge.edgeFn", message: err instanceof Error ? err.message : String(err) });
                            toast({ title: "Payment Error", description: err.message, variant: "destructive" });
                            setStripeProcessing(false);
                          });
                          return;
                        }

                        // MANUAL HELPER PAYMENT - randomized per click
                        setSelectedHelperMethod(selectedMethod);
                        console.log('[Recharge] Selected helper for package click:', selectedMethod.helper?.user?.display_name || 'Unknown helper');
                        
                        setHelperPaymentStep("form");
                        setShowHelperPaymentModal(true);
                      } else {
                        toast({
                          title: "No Helper Available",
                          description: "No payment helper available for this method.",
                          variant: "destructive"
                        });
                      }
                    } else if (adminPaymentMethods.length > 0) {
                      // Fallback to admin payment methods
                      toast({
                        title: "📋 Manual Payment",
                        description: "Copy the account number above and send payment. Then submit your transaction details.",
                      });
                    } else {
                      toast({
                        title: "No Payment Methods",
                        description: "No payment methods available for your country.",
                        variant: "destructive"
                      });
                    }
                  }
                };

                const isCardProcessing = (playStoreProcessing || stripeProcessing) && selectedPackageId === pkg.id;

                return (
                  <div key={pkg.id} className="relative group">
                    {/* Premium Luxurious Card */}
                    <div className={cn(
                      "relative p-4 rounded-2xl border-2 transition-colors overflow-hidden",
                      "bg-white",
                      "border-gray-100 hover:border-purple-300 hover:shadow-xl",
                      "shadow-[0_4px_20px_-5px_rgba(139,92,246,0.12)]"
                    )}>
                      {/* Subtle top accent line */}
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-t-2xl" />
                      
                      {/* Diamond Icon */}
                      <div className="flex justify-center mb-2.5 pt-1">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 via-indigo-50 to-pink-100 flex items-center justify-center shadow-inner ring-1 ring-purple-200/50">
                            <Diamond3DIcon size={30} />
                          </div>
                          {pkg.bonus_percentage > 0 && (
                            <div className="absolute -top-1.5 -right-1.5">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md ring-2 ring-white">
                                <Sparkles className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Coins Amount */}
                      <div className="text-center mb-2">
                        {isFirstRecharge && pkg.bonus_percentage > 0 ? (
                          <>
                            <div className="text-xl font-black bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                              {formatNumber(Math.floor(pkg.coins + (pkg.coins * pkg.bonus_percentage / 100)))}
                            </div>
                            <div className="text-[11px] text-gray-200 line-through font-medium">
                              {formatNumber(pkg.coins)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xl font-black text-gray-800">
                              {formatNumber(pkg.coins)}
                            </div>
                            {pkg.coins !== pkg.base_coins && (
                              <div className="text-[11px] text-gray-200 line-through font-medium">
                                {formatNumber(pkg.base_coins)}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Bonus Badge */}
                      {isFirstRecharge && pkg.bonus_percentage > 0 ? (
                        <div className="bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-600 text-[10px] font-bold px-3 py-1 rounded-full text-center mb-2 border border-emerald-200">
                          +{pkg.bonus_percentage}% Bonus
                        </div>
                      ) : null}

                      {/* Price Button */}
                      <button
                        onClick={handlePurchaseClick}
                        disabled={playStoreProcessing || stripeProcessing}
                        className={cn(
                          "w-full py-2.5 rounded-xl text-center font-bold text-[13px] transition-all",
                          "bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 text-white",
                          "shadow-[0_4px_16px_-3px_rgba(147,51,234,0.5)]",
                          "hover:shadow-[0_6px_24px_-3px_rgba(147,51,234,0.6)] hover:brightness-110",
                          isCardProcessing && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isCardProcessing ? (
                          <span className="flex items-center justify-center gap-1">
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          </span>
                        ) : (
                          convertToLocalCurrency(pkg.price_usd)
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Agreement - Compact */}
            <div className="flex items-center gap-1.5 mt-5 justify-center text-[10px] text-gray-200">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium">
                By purchasing you agree to our Terms & Privacy
              </span>
            </div>
          </div>
        )}
      </main>


      {/* Payment Gateway Selection Modal */}
      <Dialog open={showGatewayModal} onOpenChange={setShowGatewayModal}>
        <DialogContent className="max-w-md mx-4 rounded-3xl max-h-[85svh] overflow-y-auto overscroll-contain touch-pan-y bg-[#F7F8FA] border-slate-200" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom)' } as React.CSSProperties}>
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-white flex items-center justify-center gap-2">
              <Wallet className="w-5 h-5 text-purple-400" />
              Select Payment Method
            </DialogTitle>
            <p className="text-center text-slate-600 text-sm mt-1">
              Choose your preferred payment wallet
            </p>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {availableGateways.length > 0 ? (
              availableGateways.map((gateway, index) => {
                const isSelected = selectedGateway?.id === gateway.id;
                
                return (
                  <button
                    key={gateway.id}
                    onClick={() => {
                      setSelectedGateway(gateway);
                      setShowGatewayModal(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 group",
                      isSelected
                        ? "border-purple-500 bg-purple-500/20 shadow-lg shadow-purple-500/20"
                        : "border-slate-300/50 bg-slate-50 hover:border-purple-400/50 hover:bg-slate-100"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg transition-transform group-hover:scale-105",
                      "bg-gradient-to-br from-purple-500 to-indigo-600"
                    )}>
                      {gateway.logo_url ? (
                        <>
                          <img
                            src={gateway.logo_url}
                            alt={gateway.name}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <span className="hidden text-base font-black text-white">{paymentBrandFallback(gateway.name)}</span>
                        </>
                      ) : (
                        <span className="text-base font-black text-white">{paymentBrandFallback(gateway.name)}</span>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-bold text-white text-lg">{gateway.name}</h3>
                      <p className="text-sm text-slate-600 line-clamp-1">{gateway.description}</p>
                      {gateway.fee_percentage > 0 && (
                        <p className="text-xs text-orange-400 mt-0.5">+{gateway.fee_percentage}% fee</p>
                      )}
                    </div>
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      isSelected 
                        ? "border-purple-500 bg-purple-500" 
                        : "border-slate-500 group-hover:border-purple-400"
                    )}>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-10 text-slate-600">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                  <CreditCard className="w-8 h-8 text-slate-700" />
                </div>
                <p className="font-medium">No payment methods available</p>
                <p className="text-sm mt-1 text-slate-700">Please contact support</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-center text-xs text-slate-700">
              🔒 Secure payment with end-to-end encryption
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Form Modal */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => {
        if (!open && paymentStep !== "processing") {
          resetPaymentForm();
        }
      }}>
        <DialogContent className="max-w-md mx-4 rounded-3xl max-h-[88svh] overflow-y-auto overscroll-contain touch-pan-y bg-[#F7F8FA] border-slate-200 text-white" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom)' } as React.CSSProperties}>
          {paymentStep === "form" && selectedGateway && selectedPackage && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-lg font-bold flex items-center justify-center gap-2">
                  {getGatewayIcon(selectedGateway.gateway_code)} {selectedGateway.name} Payment
                </DialogTitle>
                <DialogDescription className="text-center">
                  Complete your payment to receive {formatNumber(selectedPackage.coins)} diamonds
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Amount Summary */}
                <div className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Amount to Pay</span>
                    <span className="text-2xl font-bold text-purple-400">
                      {convertToLocalCurrency(selectedPackage.price_usd)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">You'll receive</span>
                    <span className="font-semibold text-foreground">
                      💎 {formatNumber(selectedPackage.coins)} Diamonds
                    </span>
                  </div>
                </div>

                {/* Payment numbers are only shown in the dedicated Helper Payment Modal after package click */}

                {/* Fallback: Admin Payment Number (only show if no helper method available) */}
                {!currentHelperMethod && selectedGateway.payment_number && (
                  <div className="bg-background/50 rounded-2xl p-4 border border-white/10">
                    <Label className="text-muted-foreground text-sm">Send payment to</Label>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xl font-bold text-foreground">
                        {selectedGateway.payment_number}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(selectedGateway.payment_number || '')}
                        className="text-purple-400 hover:bg-purple-500/20"
                      >
                        <Copy className="w-4 h-4 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>
                )}

                {/* Payment Instructions */}
                {selectedGateway.payment_instructions && (
                  <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/20">
                    <p className="text-sm text-amber-400">
                      {selectedGateway.payment_instructions}
                    </p>
                  </div>
                )}

                {/* Transaction ID Input - with paste fix */}
                <div>
                  <Label htmlFor="transactionId" className="text-foreground">
                    Transaction ID / Reference Number *
                  </Label>
                  <Input
                    id="transactionId"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter your payment transaction ID"
                    className="mt-1.5 rounded-xl"
                    autoComplete="off"
                  />
                </div>

                {/* Sender Number Input */}
                <div>
                  <Label htmlFor="senderNumber" className="text-foreground">
                    Your {selectedGateway.name} Number (Optional)
                  </Label>
                  <Input
                    id="senderNumber"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    placeholder="Enter your phone number"
                    className="mt-1.5 rounded-xl"
                  />
                </div>

                {/* Payment Proof Upload */}
                <div>
                  <Label className="text-foreground">Payment Screenshot (Optional)</Label>
                  <div className="mt-1.5">
                    {paymentProof ? (
                      <div className="relative rounded-xl overflow-hidden border border-white/10">
                        <img src={paymentProof} alt="Payment proof" className="w-full h-32 object-cover" />
                        <button
                          onClick={() => setPaymentProof(null)}
                          className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:bg-white/5 transition-colors">
                        {uploadingProof ? (
                          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                            <span className="text-sm text-muted-foreground">Upload screenshot</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadProof}
                          disabled={uploadingProof}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmitPayment}
                  disabled={!transactionId.trim() || processingPayment}
                  className="w-full py-6 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold text-lg"
                >
                  Submit Payment for Verification
                </Button>
              </div>
            </>
          )}

          {paymentStep === "processing" && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <h3 className="text-lg font-bold text-foreground mb-2">Processing Payment</h3>
              <p className="text-muted-foreground">Please wait while we verify your payment...</p>
            </div>
          )}

          {paymentStep === "pending" && selectedPackage && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-amber-500/20 rounded-full flex items-center justify-center">
                <Clock className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Payment Submitted!</h3>
              <p className="text-muted-foreground mb-4">
                Your payment is being verified. Diamonds will be added to your account once approved.
              </p>
              
              <div className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/20 mb-6">
                <div className="flex items-center justify-center gap-2 text-lg font-bold text-purple-400">
                  <Diamond className="w-5 h-5" />
                  {formatNumber(selectedPackage.coins)} Diamonds
                </div>
                <p className="text-sm text-muted-foreground mt-1">Will be added after verification</p>
              </div>

              <div className="bg-blue-500/10 rounded-xl p-3 mb-6">
                <p className="text-sm text-blue-400">
                  💡 Verification usually takes 5-30 minutes. You'll receive a notification when completed.
                </p>
              </div>

              <Button
                onClick={resetPaymentForm}
                className="w-full py-4 rounded-xl bg-white/10 text-foreground hover:bg-white/20"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Helper Payment Modal */}
      <Dialog open={showHelperPaymentModal} onOpenChange={(open) => {
        if (!open && helperPaymentStep !== "processing") {
          resetHelperPaymentForm();
        }
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-[2rem] max-h-[85svh] overflow-y-auto overscroll-contain touch-pan-y p-0 mx-auto border border-amber-400/60 bg-[#140d03] shadow-[0_0_60px_-12px_rgba(251,191,36,0.45)]" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom)' } as React.CSSProperties}>
          {helperPaymentStep === "form" && selectedHelperMethod && selectedPackage && (
            <>
              <div className="px-4 pt-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-purple-400" />
                    </div>
                    <h3 className="text-base font-bold text-white">Secure Payment</h3>
                  </div>
                  <button type="button" onClick={resetHelperPaymentForm} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-700" />
                  </button>
                </div>

                <p className="text-xs text-slate-700 mb-3">
                  Pay via {selectedHelperMethod.method_name} to receive {formatNumber(selectedPackage.coins)} diamonds
                </p>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-3 mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</span>
                    <span className="text-xl font-bold text-white">
                      {selectedPackage?.price_usd ? convertToLocalCurrency(selectedPackage.price_usd) : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">You'll receive</span>
                    <span className="text-sm font-semibold text-white">
                      💎 {formatNumber(selectedPackage.coins)} Diamonds
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-900/40 to-amber-800/20 p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center overflow-hidden">
                        {(() => {
                          const resolvedLogo = resolveMethodLogo(selectedHelperMethod.logo_url, selectedHelperMethod.method_name);
                          return resolvedLogo ? (
                            <>
                              <img
                                src={resolvedLogo}
                                alt={selectedHelperMethod.method_name}
                                className="h-6 w-6 object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                              <span className="hidden text-sm font-black text-amber-200">{paymentBrandFallback(selectedHelperMethod.method_name)}</span>
                            </>
                          ) : (
                            <span className="text-sm font-black text-amber-200">{paymentBrandFallback(selectedHelperMethod.method_name)}</span>
                          );
                        })()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{selectedHelperMethod.method_name}</p>
                        <p className="text-[10px] text-slate-600">{selectedHelperMethod.additional_info?.gateway_type ? 'Merchant' : (selectedHelperMethod.account_name || selectedHelperMethod.method_name)}</p>
                      </div>
                    </div>
                    {selectedHelperMethod.additional_info?.gateway_type && (
                      <div className="px-3 py-1 rounded-full bg-amber-600/30 border border-amber-500/40 flex items-center gap-1">
                        <span className="text-[10px]">⚡</span>
                        <span className="text-[10px] font-bold text-amber-300 uppercase">Auto</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600 mb-1">
                      {selectedHelperMethod.method_name} Number
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-lg font-bold text-white tracking-wide break-all">
                        {selectedHelperMethod.account_number}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedHelperMethod.account_number)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs font-semibold"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                    </div>
                    {selectedHelperMethod.account_name && (
                      <p className="mt-1 text-[11px] text-slate-600">• Name: {selectedHelperMethod.account_name}</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-900/20 p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">⚠️</span>
                    <p className="text-xs font-bold text-amber-300">
                      {selectedHelperMethod.additional_info?.gateway_type ? 'Auto-Approve Notice' : 'Payment Notice'}
                    </p>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-500">
                    👉 You must send the <strong className="text-white">exact amount shown below</strong>, including decimals.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-700">
                    💰 Amount to send: <strong className="text-amber-300">{selectedPackage?.price_usd ? convertToLocalCurrency(selectedPackage.price_usd) : ''}</strong>
                  </p>
                  {selectedHelperMethod.additional_info?.gateway_type ? (
                    <p className="mt-1 text-[11px] text-emerald-300/90">
                      ⚡ Enter your transaction ID below to verify via ZiniPay.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-600">
                      Helper will check your payment proof and approve it.
                    </p>
                  )}
                </div>

                {helperMethodPool.length > 1 && (
                  <button
                    type="button"
                    onClick={handleShowDifferentHelperNumber}
                    disabled={helperMethodPool.length <= 1}
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-center text-[11px] font-medium text-slate-700 mb-3 disabled:opacity-40"
                  >
                    Show different number ({helperMethodCycleProgress.current}/{helperMethodCycleProgress.total})
                  </button>
                )}

                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4">
                    <p className="text-xs font-bold text-amber-300 mb-2">{selectedHelperMethod.additional_info?.gateway_type ? 'Auto-Approve Notice' : 'Payment Notice'}</p>
                    <p className="text-[13px] leading-6 text-amber-100/85">
                      👉 You must send the <strong className="text-amber-200">exact amount</strong> shown above.
                    </p>
                    <p className="mt-2 text-[13px] leading-6 text-amber-100/65">
                      💰 Amount to send: <strong className="text-yellow-300">{selectedPackage?.price_usd ? convertToLocalCurrency(selectedPackage.price_usd) : ''}</strong>
                    </p>
                    {selectedHelperMethod.additional_info?.gateway_type ? (
                      <p className="mt-2 text-[12px] text-emerald-300/90">
                        ⚡ Enter your transaction ID below to verify via ZiniPay.
                      </p>
                    ) : (
                      <p className="mt-2 text-[12px] text-amber-100/55">
                        Helper will check your payment proof and approve it.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="helperTransactionId" className="text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                      Transaction ID *
                    </Label>
                    <input
                      id="helperTransactionId"
                      type="text"
                      value={helperTransactionId}
                      onChange={(e) => setHelperTransactionId(e.target.value)}
                      onInput={(e) => setHelperTransactionId((e.target as HTMLInputElement).value)}
                      placeholder="Enter your TrxID here"
                      className="mt-1 w-full rounded-xl text-sm h-10 px-3 border border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                      autoComplete="off"
                      inputMode="text"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' } as React.CSSProperties}
                    />
                  </div>

                  {selectedHelperMethod.instructions && (
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <p className="text-[11px] text-amber-300/80 font-medium mb-1">📝 Note</p>
                      <p className="text-xs text-slate-500">{selectedHelperMethod.instructions}</p>
                    </div>
                  )}

                  {!selectedHelperMethod.additional_info?.gateway_type && (
                    <div>
                      <Label className="text-slate-600 text-[10px] uppercase tracking-wider font-semibold">Payment Screenshot *</Label>
                      <div className="mt-1">
                        {helperPaymentProof ? (
                          <div className="relative rounded-xl overflow-hidden border border-white/10">
                            <img src={helperPaymentProof} alt="Payment proof" className="w-full h-28 object-cover" />
                            <button
                              onClick={() => setHelperPaymentProof(null)}
                              className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-white/15 rounded-xl cursor-pointer hover:bg-white/[0.02] transition-colors">
                            {uploadingHelperProof ? (
                              <div className="w-5 h-5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Upload className="w-5 h-5 text-slate-600 mb-1" />
                                <span className="text-xs text-slate-600">Upload screenshot</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleUploadHelperProof}
                              disabled={uploadingHelperProof}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleHelperPaymentSubmit(); }}
                    disabled={!helperTransactionId.trim() || helperPaymentProcessing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-[#2d1a00] font-bold text-base shadow-lg transition-all disabled:opacity-40"
                  >
                    {helperPaymentProcessing
                      ? 'Processing...'
                      : selectedHelperMethod.additional_info?.gateway_type
                        ? 'Verify Transaction'
                        : 'Submit to Helper'}
                  </button>
                </div>
              </div>
            </>
          )}

          {helperPaymentStep === "processing" && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              <h3 className="text-lg font-bold text-gray-800 mb-2">Sending to Helper</h3>
              <p className="text-slate-700">Please wait while we notify the helper...</p>
            </div>
          )}

          {helperPaymentStep === "pending" && selectedPackage && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Order Submitted!</h3>
              <p className="text-slate-700 mb-4">
                Helper has been notified and will process your order instantly.
              </p>
              
              <div className="bg-gradient-to-r from-orange-50 to-rose-50 rounded-2xl p-4 border border-orange-100 mb-6">
                <div className="flex items-center justify-center gap-2 text-lg font-bold text-orange-600">
                  <Diamond className="w-5 h-5" />
                  {formatNumber(selectedPackage.coins)} Diamonds
                </div>
                <p className="text-sm text-slate-700 mt-1">Will be credited after helper approves</p>
              </div>

              <div className="bg-blue-500/10 rounded-xl p-3 mb-6">
                <p className="text-sm text-blue-400">
                  ⚡ Helper usually approves within 1-5 minutes. You'll get instant notification!
                </p>
              </div>

              <Button
                onClick={resetHelperPaymentForm}
                className="w-full py-4 rounded-xl bg-white/10 text-slate-500 hover:bg-white/20"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Recharge;
