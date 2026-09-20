// Keep unmatched receipts on the normal activation path. A bare queue row has
// no USSD template, amount, receiver substitution or SIM/PIN configuration.
type DeliveryInput = {
  payment: { id: string; tx_id?: string | null; sender_phone?: string | null };
  receiverPhone: string;
  providerId: string;
  providerName: string;
  pkg: { id: string; package_name: string; data_amount: string; selling_price: number | string };
};

type DeliveryClient = {
  from: (table: 'orders' | 'payment_receipts' | 'delivery_queue') => any;
  functions: { invoke: (name: string, options: any) => Promise<any> };
};

const inFlight = new Map<string, Promise<string>>();

export function queueUnmatchedDelivery(client: DeliveryClient, input: DeliveryInput): Promise<string> {
  const active = inFlight.get(input.payment.id);
  if (active) return active;
  const work = queueReceipt(client, input).finally(() => inFlight.delete(input.payment.id));
  inFlight.set(input.payment.id, work);
  return work;
}

async function queueReceipt(client: DeliveryClient, input: DeliveryInput): Promise<string> {
  const { payment, receiverPhone, providerId, providerName, pkg } = input;
  if (!/^\d{9}$/.test(receiverPhone) || !providerName || !providerId || !pkg.id) {
    throw new Error('Dooro shirkad, xirmo iyo lambar sax ah.');
  }

  const { data: receipt, error: receiptError } = await client.from('payment_receipts')
    .select('id, status, matched_order_id').eq('id', payment.id).single();
  if (receiptError) throw receiptError;
  if (receipt.status !== 'unmatched') {
    throw new Error('Receipt-kan hore ayaa loo maareeyey. Cusboonaysii bogga.');
  }

  // orders.tx_id is UNIQUE in production. Preserve carrier transaction IDs,
  // and use the receipt ID as a stable retry key only when a receipt has none.
  const txId = payment.tx_id || `unmatched:${payment.id}`;
  const readOrder = () => client.from('orders')
    .select('id, package_id, provider_id, receiver_phone, payment_source, delivery_status')
    .eq('tx_id', txId).maybeSingle();

  let { data: order, error: lookupError } = await readOrder();
  if (lookupError) throw lookupError;

  if (!order) {
    const senderPhone = String(payment.sender_phone || '').replace(/\D/g, '').slice(-9);
    const result = await client.from('orders').insert({
      customer_phone: senderPhone,
      sender_phone: senderPhone,
      receiver_phone: receiverPhone,
      package_id: pkg.id,
      provider_id: providerId,
      package_name: pkg.package_name,
      data_amount: pkg.data_amount,
      selling_price: pkg.selling_price,
      status: 'payment_confirmed',
      delivery_status: 'pending',
      payment_source: 'offline_unmatched_retry',
      is_manual: true,
      tx_id: txId,
    }).select('id, package_id, provider_id, receiver_phone, payment_source, delivery_status').single();

    if (result.error?.code === '23505') {
      const existing = await readOrder();
      if (existing.error) throw existing.error;
      order = existing.data;
    } else {
      if (result.error) throw result.error;
      order = result.data;
    }
  }

  if (!order || order.payment_source !== 'offline_unmatched_retry' ||
      order.package_id !== pkg.id || order.provider_id !== providerId ||
      String(order.receiver_phone).replace(/\D/g, '').slice(-9) !== receiverPhone ||
      (receipt.matched_order_id && receipt.matched_order_id !== order.id)) {
    throw new Error('Receipt-kan dalab kale ayuu ku xiran yahay. Hubi dalabka ka hor diris kale.');
  }

  if (['verification_required', 'failed', 'cancelled', 'blocked'].includes(order.delivery_status)) {
    throw new Error('Dalabkan wuxuu u baahan yahay hubin. Si toos ah dib looma diri karo.');
  }

  const readQueues = () => client.from('delivery_queue')
    .select('id, status, ussd_code, dispatched_at').eq('order_id', order.id);

  let { data: queues, error: queueReadError } = await readQueues();
  if (queueReadError) throw queueReadError;

  // Legacy Unmatched → Dib u Dir created a bare pending queue row with no
  // ussd_code. It was never dispatchable. Remove ONLY that known-safe stale row
  // (pending/scheduled + never dispatched + empty code) so activate-package can
  // rebuild the delivery from the authoritative package/provider instructions.
  // Any processing/completed/verification_required/dispatched row is ambiguous
  // and must never be reset or replaced automatically.
  const allowedQueueStatuses = ['pending', 'scheduled', 'processing', 'completed'];
  const staleBareQueues = (queues || []).filter((q: any) =>
    !String(q.ussd_code || '').trim() &&
    !q.dispatched_at &&
    ['pending', 'scheduled'].includes(q.status)
  );
  const ambiguousQueues = (queues || []).filter((q: any) =>
    !staleBareQueues.includes(q) &&
    (!String(q.ussd_code || '').trim() || !allowedQueueStatuses.includes(q.status))
  );

  if (ambiguousQueues.length) {
    throw new Error('Delivery-gu wuxuu u baahan yahay hubin; code ma jiro ama natiijadu ma cadda.');
  }

  if (staleBareQueues.length) {
    const staleIds = staleBareQueues.map((q: any) => q.id);
    const { error: deleteError } = await client.from('delivery_queue')
      .delete().in('id', staleIds);
    if (deleteError) throw deleteError;
    const refreshed = await readQueues();
    if (refreshed.error) throw refreshed.error;
    queues = refreshed.data;
  }

  const validExistingQueue = (queues || []).find((q: any) =>
    String(q.ussd_code || '').trim() && allowedQueueStatuses.includes(q.status)
  );

  if (!validExistingQueue) {
    if (order.delivery_status === 'delivered') {
      throw new Error('Dalabkan hore ayaa loo gaarsiiyey; hubi diiwaanka delivery-ga.');
    }

    // activate-package resolves Package > Category > Provider instructions,
    // formats the actual package cost, substitutes receiver/PIN and queues it.
    const { data, error } = await client.functions.invoke('activate-package', {
      body: { orderId: order.id, providerName, receiverPhone },
    });
    if (error) throw error;
    if (!data?.success || !data?.queueId) {
      throw new Error(data?.error || 'Delivery queue lama diyaarin. Receipt-ku weli waa unmatched.');
    }

    const checked = await readQueues();
    if (checked.error) throw checked.error;
    queues = checked.data;
  }

  // A network retry may find the original queue already processing/completed.
  // Reuse it; never reset it or create a replacement for an ambiguous delivery.
  if (!queues?.length || !queues.some((q: any) =>
    String(q.ussd_code || '').trim() && allowedQueueStatuses.includes(q.status))) {
    throw new Error('Delivery-gu wuxuu u baahan yahay hubin; code ma jiro ama natiijadu ma cadda.');
  }

  const { data: matched, error: matchError } = await client.from('payment_receipts').update({
    status: 'matched',
    matched_order_id: order.id,
    admin_notes: `Manually matched to package ${pkg.package_name} (${providerName}) via admin retry`,
  }).eq('id', payment.id).eq('status', 'unmatched').select('id').maybeSingle();

  if (matchError) throw matchError;
  if (!matched) throw new Error('Receipt-ka xaaladdiisa way is beddeshay. Cusboonaysii bogga.');
  return order.id;
}
