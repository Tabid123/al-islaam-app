import { supabase } from '@/integrations/supabase/client';

export function isApiPayment(provider: { provider_name?: string } | null | undefined): boolean {
  return String(provider?.provider_name || '').trim().toLowerCase() === 'waafipay';
}

export function paymentRoute(provider: { provider_name?: string } | null | undefined, online: boolean): 'api' | 'ussd' | 'unavailable' {
  if (!String(provider?.provider_name || '').trim()) return 'unavailable';
  return isApiPayment(provider) ? (online ? 'api' : 'unavailable') : 'ussd';
}

export async function purchaseWithWaafiPay(input: {
  client_reference: string; payer_phone: string; receiver_phone: string;
  package_id: string; payment_provider_id: string; scheduled_for: string | null;
}) {
  const { data, error } = await supabase.functions.invoke('waafipay-purchase', { body: input });
  let payload = data;
  if (error?.context && typeof error.context.json === 'function') {
    try { payload = await error.context.json(); } catch {}
  }
  if (error || payload?.error || payload?.payment_approved !== true) {
    const failure = new Error(payload?.message || 'Lacag-bixinta API lama xaqiijin. Ha ku celin lacagta haddii lagaa jaray.');
    Object.assign(failure, { code: payload?.error || 'payment_status_unknown' });
    throw failure;
  }
  return payload as { payment_approved: boolean; delivery_queued: boolean; order_id?: string; reference_id: string; message?: string };
}
