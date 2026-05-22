import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeCountryCode,
  normalizeGatewayRow,
  gatewayServesCountry,
  PaymentValidationError,
} from '@/features/payments/gatewayValidation';

export interface CountryPaymentGateway {
  id: string;
  gateway_type: string;
  name: string;
  country_codes: string[] | null;
  logo_url: string | null;
  is_integrated: boolean;
  is_active: boolean;
  display_order: number | null;
  config: Record<string, any> | null;
}

/**
 * Fetch active integrated payment gateways for a given country.
 * Returns gateways whose country_codes array contains the requested country
 * OR contains 'GLOBAL' (multi-region gateways like Wise, PayPal, Crypto).
 *
 * Also returns ALL gateways (no filter) when countryCode is null.
 */
export const useCountryPaymentGateways = (countryCode?: string | null) => {
  const [gateways, setGateways] = useState<CountryPaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('payment_gateways')
      .select('id, gateway_type, name, country_codes, logo_url, is_integrated, is_active, display_order, config')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('[useCountryPaymentGateways] Load error:', error);
      setGateways([]);
    } else {
      const raw = (data || []) as unknown[];
      // Normalize country code once with strict validation (throws on garbage input).
      let cc: string | null = null;
      try {
        cc = countryCode ? normalizeCountryCode(countryCode) : null;
      } catch (e) {
        if (e instanceof PaymentValidationError) {
          console.error('[useCountryPaymentGateways] Bad country code:', e.code, e.message);
          cc = null; // fail closed: no gateways
        } else {
          throw e;
        }
      }
      // Normalize each row defensively; skip (and log) any malformed row instead of crashing.
      const normalized = raw.flatMap((row) => {
        try {
          return [normalizeGatewayRow(row)];
        } catch (e) {
          if (e instanceof PaymentValidationError) {
            console.warn('[useCountryPaymentGateways] Dropping invalid gateway row:', e.code, e.details);
            return [];
          }
          throw e;
        }
      });
      const filtered = cc !== null
        ? normalized.filter((g) => gatewayServesCountry(g, cc))
        : normalized;
      // Cast back to legacy shape consumers expect.
      setGateways(filtered as unknown as CountryPaymentGateway[]);
    }
    setLoading(false);
  }, [countryCode]);

  useEffect(() => { load(); }, [load]);

  // Admin-driven instant sync: payment_gateways is NOT in supabase_realtime;
  // Pkg37 admin_broadcast is the single allowed realtime path.
  useEffect(() => {
    const onAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'payment_gateways') void load();
    };

    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
  }, [load]);

  return { gateways, loading, reload: load };
};
