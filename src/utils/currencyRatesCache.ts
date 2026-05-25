/**
 * 🗂️ Shared currency_rates cache (Pkg D pass-3)
 *
 * Five end-user pages read `currency_rates` independently
 * (AgencyWithdrawal, AgencyDashboard, Level5HelperDashboard, and a few
 * helper screens). All want active rows, just project different columns.
 *
 * We fetch the full row once and let callers project what they need.
 * Admin edits to the table broadcast `admin-table-update` for
 * `currency_rates`, which busts the cache (handled by queryCache).
 */

import { supabase } from '@/integrations/supabase/client';
import { getCachedQuery, invalidateQuery } from './queryCache';

export interface CurrencyRateRow {
  country_code: string | null;
  currency_code: string;
  currency_symbol: string | null;
  rate_to_usd: number;
  is_active?: boolean | null;
}

const KEY = 'currency_rates:active';

export async function getActiveCurrencyRates(): Promise<CurrencyRateRow[]> {
  return getCachedQuery<CurrencyRateRow[]>(
    KEY,
    async () => {
      const { data, error } = await supabase
        .from('currency_rates')
        .select('country_code, currency_code, currency_symbol, rate_to_usd, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as CurrencyRateRow[];
    },
    { invalidateOnTables: ['currency_rates'] },
  );
}

/** Lookup the active currency rate row for a given country, if any. */
export async function getCurrencyRateForCountry(countryCode: string | null | undefined): Promise<CurrencyRateRow | null> {
  if (!countryCode) return null;
  const upper = String(countryCode).toUpperCase();
  const rows = await getActiveCurrencyRates();
  return rows.find((r) => String(r.country_code ?? '').toUpperCase() === upper) ?? null;
}

/** Build a `{ currency_code -> rate_to_usd }` map for legacy callers. */
export async function getCurrencyRateMap(): Promise<Record<string, number>> {
  const rows = await getActiveCurrencyRates();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.currency_code] = Number(r.rate_to_usd);
  return out;
}

export function invalidateCurrencyRates() {
  invalidateQuery(KEY);
}
