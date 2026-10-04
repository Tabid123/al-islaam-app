import { supabase } from '@/integrations/supabase/client';

export function isApiPayment(provider: { provider_name?: string; payment_mode?: string } | null | undefined): boolean {
  if (provider?.payment_mode) return provider.payment_mode === 'waafipay_api';
  return String(provider?.provider_name || '').trim().toLowerCase() === 'waafipay';
}

export function paymentRoute(provider: { provider_name?: string; payment_mode?: string } | null | undefined, online: boolean): 'api' | 'ussd' | 'unavailable' {
  if (!String(provider?.provider_name || '').trim()) return 'unavailable';
  return isApiPayment(provider) ? (online ? 'api' : 'unavailable') : 'ussd';
}

type PurchaseInput = {
  client_reference: string; payer_phone: string; receiver_phone: string;
  package_id: string; payment_provider_id: string; scheduled_for: string | null;
};

async function requestPayment(body: PurchaseInput & { action?: 'status' }) {
  try {
    const { data, error } = await supabase.functions.invoke('waafipay-purchase', { body });
    let payload = data;
    if (error?.context && typeof error.context.json === 'function') {
      try { payload = await error.context.json(); } catch {}
    }
    return { payload, error };
  } catch (error) {
    return { payload: null, error };
  }
}

export async function purchaseWithWaafiPay(input: PurchaseInput) {
  let { payload } = await requestPayment(input);
  // Only read the original attempt after an ambiguous response. Repeating the
  // purchase request here could debit the customer again.
  if (payload?.payment_approved !== true && (!payload?.error || payload.error === 'payment_status_unknown')) {
    for (let attempt = 0; attempt < 65; attempt++) {
      const status = await requestPayment({ ...input, action: 'status' });
      if (status.payload?.payment_approved === true || status.payload?.error) {
        payload = status.payload;
        break;
      }
      // A genuine authorization or validation failure must not become a retry.
      if (status.error && !status.payload) break;
      if (!['processing', 'not_found'].includes(status.payload?.payment_status)) break;
      if (attempt < 64) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  if (payload?.error || payload?.payment_approved !== true) {
    const failure = new Error(payload?.message || 'Lacag-bixinta API lama xaqiijin. Ha ku celin lacagta haddii lagaa jaray.');
    Object.assign(failure, { code: payload?.error || 'payment_status_unknown',
      errorType: payload?.error_type || 'general', title: payload?.title || (payload?.error ? undefined : 'Xaaladda lacag-bixinta lama xaqiijin'),
      safeToRetry: payload?.safe_to_retry ?? ['invalid_purchase_fields', 'package_not_available', 'discovery_api_not_supported', 'invalid_receiver', 'blocked_payer', 'provider_not_available', 'invalid_schedule', 'delivery_not_configured', 'invalid_package_price', 'too_many_payment_attempts', 'waafipay_inactive'].includes(payload?.error), });
    throw failure;
  }
  return payload as { payment_approved: boolean; delivery_queued: boolean; order_id?: string; reference_id: string; message?: string };
}
