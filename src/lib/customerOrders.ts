import { supabase } from '@/integrations/supabase/client';

export function normalizeSomaliPhone(phone?: string | null) {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function getCustomerPhones() {
  return [...new Set([
    localStorage.getItem('verifiedPhone'),
    localStorage.getItem('offlineSenderPhone'),
  ].map(normalizeSomaliPhone).filter(phone => /^\d{9}$/.test(phone)))];
}

export async function fetchCustomerOrders(phones: string[], scheduledOnly = false) {
  const customers = [...new Set(phones.map(normalizeSomaliPhone).filter(phone => /^\d{9}$/.test(phone)))];
  // Never issue an unfiltered orders query when there is no valid account phone.
  if (!customers.length) return [];
  const variants = [...new Set(customers.flatMap(phone => [phone, '252' + phone, '+252' + phone, '0' + phone]))];
  const values = variants.join(',');
  let query = supabase.from('orders').select(
    'id,package_name,data_amount,selling_price,receiver_phone,customer_phone,sender_phone,status,delivery_status,provider_id,package_id,tx_id,created_at,delivered_at,scheduled_for,invoice_url,payment_source'
  ).or(`customer_phone.in.(${values}),sender_phone.in.(${values})`);
  if (scheduledOnly) {
    query = query.not('scheduled_for', 'is', null).order('scheduled_for', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false }).limit(200);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function watchCustomerOrders(channelName: string, refresh: () => void) {
  const channel = supabase.channel(channelName).on('postgres_changes', {
    event: '*', schema: 'public', table: 'orders',
  }, payload => {
    const phones = getCustomerPhones();
    const rows = [payload.new, payload.old] as any[];
    if (rows.some(order => order && [order.customer_phone, order.sender_phone]
      .some(phone => phones.includes(normalizeSomaliPhone(phone))))) refresh();
  }).subscribe();
  const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    void supabase.removeChannel(channel);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
