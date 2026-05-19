import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
      const all = (data || []) as CountryPaymentGateway[];
      // Client-side country filter (PostgREST array overlap is finicky)
      const cc = countryCode?.toUpperCase();
      const filtered = cc
        ? all.filter(g => {
            const codes = (g.country_codes || []).map((c) => String(c).toUpperCase());
            return codes.includes(cc) || codes.includes('GLOBAL');
          })
        : all;
      setGateways(filtered);
    }
    setLoading(false);
  }, [countryCode]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on any change
  useEffect(() => {
    const channel = supabase
      .channel(`payment-gateways-${countryCode || 'all'}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'payment_gateways' },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, countryCode]);

  return { gateways, loading, reload: load };
};
