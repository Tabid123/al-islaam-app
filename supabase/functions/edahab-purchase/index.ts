
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { normalizeProviderSlug, getDeliveryInstruction, queueDeliveryWithBundling, applyFlow870PackageConfig, buildUssdCode, isUssdMalformed, hasActiveDelivery } from './delivery.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanPhone(input: unknown) {
  let n = String(input || '').replace(/\D/g, '');
  if (n.startsWith('252')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return n;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function edahabPost(endpoint: string, body: Record<string, unknown>, apiSecret: string) {
  const raw = JSON.stringify(body);
  const hash = await sha256Hex(raw + apiSecret);
  const res = await fetch('https://edahab.net/api/api/' + endpoint + '?hash=' + hash, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  let payload: any = {};
  try { payload = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error('edahab_http_' + res.status);
  return payload;
}

function classify(payload: any) {
  const invoice = String(payload?.InvoiceStatus || '').toLowerCase();
  const code = Number(payload?.StatusCode);
  if (code === 0 && invoice === 'paid' && payload?.TransactionId) return 'approved';
  if (invoice === 'pending') return 'pending';
  if (invoice === 'unpaid' || invoice === 'invalid' || [3,4,5,6,7].includes(code)) return 'declined';
  if (code === 0 && payload?.invoiceId) return 'pending';
  return 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!req.headers.get('Authorization')) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let tx: any = null;
  try {
    const body = await req.json();
    const ref = String(body.client_reference || '');
    const payer = cleanPhone(body.payer_phone);
    const receiver = cleanPhone(body.receiver_phone);
    const requestedCustomer = body.customer_phone == null ? null : cleanPhone(body.customer_phone);
    const packageId = String(body.package_id || '');
    const paymentProviderId = String(body.payment_provider_id || '');
    if (!UUID.test(ref) || !UUID.test(packageId) || !UUID.test(paymentProviderId) ||
        !/^\d{9}$/.test(payer) || !/^\d{7,9}$/.test(receiver) ||
        (requestedCustomer !== null && !/^\d{9}$/.test(requestedCustomer))) {
      return json({ error: 'invalid_purchase_fields', message: 'Hubi lambarada iyo xirmada.', safe_to_retry: true }, 422);
    }

    const { data: existing, error: lookupError } = await admin
      .from('edahab_transactions').select('*').eq('client_reference', ref).maybeSingle();
    if (lookupError) throw lookupError;
    tx = existing;

    if (tx && (tx.payer_phone !== payer || tx.receiver_phone !== receiver ||
      tx.package_id !== packageId || tx.payment_provider_id !== paymentProviderId ||
      (requestedCustomer !== null && tx.customer_phone !== requestedCustomer))) {
      return json({ error: 'reference_mismatch', message: 'Lacag-bixin hore ayaa xog kale ku xiran.', safe_to_retry: false }, 409);
    }

    const customer = tx?.customer_phone || requestedCustomer || payer;

    const [{ data: pkg, error: pkgError }, { data: payment, error: payError }, { data: credentials, error: credError }] = await Promise.all([
      admin.from('data_packages_config')
        .select('id,provider_id,category_id,package_name,data_amount,selling_price,cost_price,is_active,is_discovery_root,phone_prefix,ussd_code,menu1,menu2,sim_password,somlink_bundle_id')
        .eq('id', packageId).maybeSingle(),
      admin.from('payment_providers_config').select('id,provider_name,is_active,payment_mode').eq('id', paymentProviderId).maybeSingle(),
      admin.rpc('edahab_backend_credentials'),
    ]);
    if (pkgError || payError || credError) throw pkgError || payError || credError;
    if (!pkg?.is_active || !payment?.is_active || payment.payment_mode !== 'edahab_api') {
      return json({ error: 'package_not_available', message: 'Xirmada ama eDahab API ma shaqaynayo.', safe_to_retry: true }, 404);
    }
    if (!credentials?.is_active || !credentials?.api_key || !credentials?.api_secret) {
      return json({ error: 'edahab_inactive', message: 'eDahab API lama diyaarin.', safe_to_retry: true }, 409);
    }
    if (pkg.is_discovery_root) {
      return json({ error: 'discovery_api_not_supported', message: 'Maamuus hadda eDahab API laguma bixin karo.', safe_to_retry: true }, 422);
    }

    const prefixes = String(pkg.phone_prefix || '').split(/[,/\s]+/).filter(Boolean);
    if (prefixes.length && !prefixes.some((p: string) => receiver.startsWith(p))) {
      return json({ error: 'invalid_receiver', message: 'Lambarka qaataha xirmadan kuma habboona.', safe_to_retry: true }, 422);
    }

    const { data: providerConfig, error: providerError } = await admin
      .from('providers_config').select('provider_name,is_active').eq('id', pkg.provider_id).maybeSingle();
    if (providerError) throw providerError;
    if (!providerConfig?.is_active) return json({ error: 'provider_not_available', safe_to_retry: true }, 404);

    const scheduledFor = tx?.raw_response?.request_context?.scheduled_for || body.scheduled_for || null;
    if (!tx && scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) < Date.now() + 60000)) {
      return json({ error: 'invalid_schedule', safe_to_retry: true }, 422);
    }

    const isSomlink = normalizeProviderSlug(providerConfig.provider_name) === 'somlink';
    let instruction: any = null;
    let bundleCount = 0;
    if (isSomlink) {
      if (!Number.isInteger(Number(pkg.somlink_bundle_id)) || Number(pkg.somlink_bundle_id) <= 0 ||
          !Number.isFinite(Number(pkg.cost_price)) || Number(pkg.cost_price) <= 0) {
        return json({ error: 'somlink_package_not_configured', message: 'Xirmadan Somlink si sax ah looma diyaarin.', safe_to_retry: true }, 409);
      }
    } else {
      instruction = await getDeliveryInstruction(admin, pkg.provider_id, pkg.id, pkg.category_id);
      const { count, error: bundleError } = await admin.from('package_delivery_rules')
        .select('id', { head: true, count: 'exact' }).eq('source_package_id', pkg.id).eq('is_active', true);
      if (bundleError) throw bundleError;
      bundleCount = count || 0;
      if (!instruction?.code_template && !bundleCount) {
        return json({ error: 'delivery_not_configured', message: 'Dirista xirmadan lama diyaarin. Lacag lagama jarin.', safe_to_retry: true }, 409);
      }
    }

    const amount = tx ? Number(tx.amount) : Math.round(Number(pkg.selling_price) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid_package_price', safe_to_retry: true }, 422);

    if (body.action === 'status') {
      if (!tx) return json({ payment_status: 'not_found', payment_approved: false }, 202);
      if (tx.status === 'approved') {
        const queued = tx.order_id ? await hasActiveDelivery(admin, tx.order_id) : false;
        return json({ payment_status: 'approved', payment_approved: true, delivery_queued: queued,
          order_id: tx.order_id || undefined, reference_id: tx.client_reference });
      }
      if (!tx.invoice_id) {
        return json({ payment_status: tx.status, payment_approved: false, reference_id: tx.client_reference }, 202);
      }
      const check = await edahabPost('CheckInvoiceStatus', { apiKey: credentials.api_key, invoiceId: tx.invoice_id }, credentials.api_secret);
      const status = classify(check);
      const now = new Date().toISOString();
      const { data: updated, error } = await admin.from('edahab_transactions').update({
        status,
        invoice_status: String(check?.InvoiceStatus || ''),
        transaction_id: check?.TransactionId ? String(check.TransactionId) : tx.transaction_id,
        request_id: check?.RequestId ? String(check.RequestId) : tx.request_id,
        response_code: Number.isFinite(Number(check?.StatusCode)) ? Number(check.StatusCode) : null,
        response_message: String(check?.StatusDescription || ''),
        raw_response: { ...check, request_context: tx.raw_response?.request_context || {} },
        approved_at: status === 'approved' ? now : tx.approved_at,
        updated_at: now,
      }).eq('id', tx.id).select('*').single();
      if (error) throw error;
      tx = updated;
      if (status !== 'approved') {
        if (status === 'pending' || status === 'unknown') {
          return json({ payment_status: status, payment_approved: false, reference_id: tx.client_reference }, 202);
        }
        return json({ error: 'payment_declined', message: check?.StatusDescription || 'Lacag-bixinta eDahab waa la diiday.', safe_to_retry: true }, 402);
      }
    } else if (body.action && body.action !== 'purchase') {
      return json({ error: 'invalid_action' }, 422);
    }

    if (!tx) {
      const since = new Date(Date.now() - 5 * 60000).toISOString();
      const { data: recent, error: rateError } = await admin.from('edahab_transactions')
        .select('status').eq('payer_phone', payer).gte('created_at', since);
      if (rateError) throw rateError;
      if ((recent || []).some((t: any) => ['processing','pending','unknown'].includes(t.status))) {
        return json({ error: 'payment_status_unknown', message: 'Lacag-bixin hore wali lama xaqiijin.', safe_to_retry: false }, 409);
      }
      if ((recent || []).length >= 3) {
        return json({ error: 'too_many_payment_attempts', message: 'Sug dhowr daqiiqo ka hor isku dayga xiga.', safe_to_retry: true }, 429);
      }

      const context = { scheduled_for: scheduledFor, customer_phone: customer };
      const { data: inserted, error: insertError } = await admin.from('edahab_transactions').insert({
        client_reference: ref, payer_phone: payer, receiver_phone: receiver, customer_phone: customer,
        package_id: packageId, payment_provider_id: paymentProviderId, amount, currency: 'USD',
        status: 'processing', raw_response: { request_context: context },
      }).select('*').single();
      if (insertError) throw insertError;
      tx = inserted;

      let response: any;
      try {
        response = await edahabPost('Issueinvoice', {
          apiKey: credentials.api_key,
          edahabNumber: payer,
          amount,
          agentCode: credentials.agent_code,
          currency: 'USD',
        }, credentials.api_secret);
      } catch {
        await admin.from('edahab_transactions').update({
          status: 'unknown', error_message: 'Provider response could not be confirmed', updated_at: new Date().toISOString(),
        }).eq('id', tx.id);
        return json({ error: 'payment_status_unknown', message: 'Xaaladda lacag-bixinta lama xaqiijin. Ha ku celin.', safe_to_retry: false }, 502);
      }

      const status = classify(response);
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await admin.from('edahab_transactions').update({
        status,
        invoice_status: String(response?.InvoiceStatus || ''),
        invoice_id: response?.invoiceId ? String(response.invoiceId) : null,
        transaction_id: response?.TransactionId ? String(response.TransactionId) : null,
        request_id: response?.RequestId ? String(response.RequestId) : null,
        response_code: Number.isFinite(Number(response?.StatusCode)) ? Number(response.StatusCode) : null,
        response_message: String(response?.StatusDescription || ''),
        raw_response: { ...response, request_context: context },
        approved_at: status === 'approved' ? now : null,
        updated_at: now,
      }).eq('id', tx.id).select('*').single();
      if (updateError) throw updateError;
      tx = updated;

      if (status !== 'approved') {
        if (status === 'pending' || status === 'unknown') {
          return json({ payment_status: status, payment_approved: false, reference_id: tx.client_reference }, 202);
        }
        const code = Number(response?.StatusCode);
        return json({
          error: code === 5 ? 'insufficient_balance' : 'payment_declined',
          error_type: code === 5 ? 'insufficient_balance' : 'general',
          message: response?.StatusDescription || 'Lacag-bixinta eDahab waa la diiday.',
          safe_to_retry: true,
        }, 402);
      }
    }

    if (tx.status !== 'approved') return json({ payment_status: tx.status, payment_approved: false }, 202);

    let order: any = null;
    if (tx.order_id) {
      const { data, error } = await admin.from('orders').select('id,delivery_status').eq('id', tx.order_id).single();
      if (error) throw error;
      order = data;
    } else {
      const txId = 'edahab:' + tx.transaction_id;
      const { data: existingOrder, error: lookupOrderError } = await admin.from('orders')
        .select('id,delivery_status').eq('tx_id', txId).maybeSingle();
      if (lookupOrderError) throw lookupOrderError;
      order = existingOrder;
      if (!order) {
        const { data, error } = await admin.from('orders').insert({
          customer_phone: customer, sender_phone: payer, receiver_phone: receiver,
          provider_id: pkg.provider_id, package_id: pkg.id, package_name: pkg.package_name,
          data_amount: pkg.data_amount, selling_price: amount, cost_price: Number(pkg.cost_price || 0),
          payment_provider_id: paymentProviderId, payment_source: 'edahab_api',
          status: 'completed', delivery_status: 'pending', tx_id: txId, scheduled_for: scheduledFor,
        }).select('id,delivery_status').single();
        if (error) throw error;
        order = data;
      }
      const { data: claimed, error: claimError } = await admin.from('edahab_transactions')
        .update({ order_id: order.id }).eq('id', tx.id).is('order_id', null).select('id');
      if (claimError) throw claimError;

      if (claimed?.length) {
        if (isSomlink) {
          const { error } = await admin.rpc('enqueue_somlink_delivery', { p_order_id: order.id });
          if (error) throw error;
        } else {
          const slug = normalizeProviderSlug(providerConfig.provider_name);
          const bundled = await queueDeliveryWithBundling(admin, order.id, pkg.id, pkg.provider_id, receiver, slug, scheduledFor);
          if (bundled === null) {
            const flow = applyFlow870PackageConfig(instruction.code_template, pkg, instruction);
            const code = buildUssdCode(flow.template, receiver, Number(pkg.cost_price), flow.pinCode || instruction.sim_password || '', pkg.ussd_code || '');
            if (isUssdMalformed(code).malformed) throw new Error('Delivery template invalid');
            const { error } = await admin.from('delivery_queue').insert({
              order_id: order.id, provider_name: slug, ussd_code: code, receiver_phone: receiver,
              package_code: pkg.ussd_code, pin_code: flow.pinCode,
              status: scheduledFor ? 'scheduled' : 'pending',
              scheduled_at: scheduledFor || new Date().toISOString(),
            });
            if (error) throw error;
          }
        }
      }
    }

    const queued = await hasActiveDelivery(admin, order.id);
    return json({ success: true, payment_approved: true, delivery_queued: queued,
      order_id: order.id, reference_id: tx.client_reference });
  } catch {
    if (tx?.status === 'approved') {
      return json({ success: true, payment_approved: true, delivery_queued: false,
        order_id: tx.order_id || undefined, reference_id: tx.client_reference,
        message: 'Lacagta waa la xaqiijiyey; dirista xirmada adeegga macaamiisha ha hubiyo.' }, 202);
    }
    if (!tx) return json({ error: 'payment_service_unavailable', message: 'eDahab API lama heli karo.', safe_to_retry: true }, 500);
    return json({ error: 'payment_status_unknown', message: 'Xaaladda lacag-bixinta lama xaqiijin. Ha ku celin.', safe_to_retry: false }, 500);
  }
});
