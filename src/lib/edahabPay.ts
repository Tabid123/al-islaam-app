// CI verification: eDahab/Cloudflare build
import { supabase } from '@/integrations/supabase/client';

type EdahabPurchaseInput = {
  client_reference: string;
  payer_phone: string;
  receiver_phone: string;
  customer_phone?: string;
  package_id: string;
  payment_provider_id: string;
  scheduled_for: string | null;
};

async function requestEdahab(body: EdahabPurchaseInput & { action?: 'status' }) {
  try {
    const { data, error } = await supabase.functions.invoke('edahab-purchase', { body });
    let payload = data;
    if (error?.context && typeof error.context.json === 'function') {
      try { payload = await error.context.json(); } catch {}
    }
    return { payload, error };
  } catch (error) {
    return { payload: null, error };
  }
}

export async function purchaseWithEdahab(input: EdahabPurchaseInput) {
  let { payload } = await requestEdahab(input);

  if (payload?.payment_approved !== true &&
      (!payload?.error || ['payment_status_unknown'].includes(payload.error) ||
       ['processing', 'pending', 'unknown', 'not_found'].includes(payload?.payment_status))) {
    for (let attempt = 0; attempt < 65; attempt++) {
      const status = await requestEdahab({ ...input, action: 'status' });
      if (status.payload?.payment_approved === true) {
        payload = status.payload;
        break;
      }
      if (status.payload?.error) {
        payload = status.payload;
        break;
      }
      if (status.error && !status.payload) break;
      if (!['processing', 'pending', 'unknown', 'not_found'].includes(status.payload?.payment_status)) break;
      if (attempt < 64) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (payload?.error || payload?.payment_approved !== true) {
    const failure = new Error(
      payload?.message ||
      'Lacag-bixinta eDahab lama xaqiijin. Ha ku celin lacagta haddii lagaa jaray.'
    );
    Object.assign(failure, {
      code: payload?.error || 'payment_status_unknown',
      errorType: payload?.error_type || 'general',
      title: payload?.title || (payload?.error ? undefined : 'Xaaladda lacag-bixinta lama xaqiijin'),
      safeToRetry: payload?.safe_to_retry ?? [
        'invalid_purchase_fields',
        'package_not_available',
        'invalid_receiver',
        'provider_not_available',
        'invalid_schedule',
        'delivery_not_configured',
        'invalid_package_price',
        'too_many_payment_attempts',
        'edahab_inactive',
        'payment_declined',
        'insufficient_balance',
        'discovery_api_not_supported',
      ].includes(payload?.error),
    });
    throw failure;
  }

  return payload as {
    payment_approved: boolean;
    delivery_queued: boolean;
    order_id?: string;
    reference_id: string;
    message?: string;
  };
}
