import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Provider = Database['public']['Tables']['payment_providers_config']['Row'];
export const PAYMENT_CACHE_KEY = 'offline_payment_providers_v2';
export const PAYMENT_QUERY_KEY = ['paymentProvidersV2'] as const;

export function activePaymentProviders(rows: unknown): Provider[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(p => p?.is_active === true && ['ussd', 'waafipay_api', 'edahab_api'].includes(p.payment_mode));
}

export function readCachedPaymentProviders(): Provider[] {
  try { return activePaymentProviders(JSON.parse(localStorage.getItem(PAYMENT_CACHE_KEY) || '[]')); }
  catch { return []; }
}

let latestRequest: Promise<Provider[]> | undefined;
let latestGeneration = 0;
export function fetchActivePaymentProviders(): Promise<Provider[]> {
  const generation = ++latestGeneration;
  const request: Promise<Provider[]> = (async () => {
    const { data, error } = await supabase.from('payment_providers_config').select('*').eq('is_active', true).order('display_order');
    if (error) throw error;
    // A slower prefetch must never overwrite a newer admin change.
    if (generation !== latestGeneration) return latestRequest!;
    const providers = activePaymentProviders(data);
    try { localStorage.setItem(PAYMENT_CACHE_KEY, JSON.stringify(providers)); } catch {}
    return providers;
  })();
  latestRequest = request;
  return request;
}
