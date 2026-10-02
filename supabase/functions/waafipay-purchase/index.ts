import { paymentFailure } from './errors.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { normalizeProviderSlug, getDeliveryInstruction, queueDeliveryWithBundling, applyFlow870PackageConfig, buildUssdCode, isUssdMalformed, hasActiveDelivery } from './delivery.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizePhone(input: unknown) {
  let n = String(input || '').replace(/\D/g, '');
  if (n.startsWith('252')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return n;
}
export function classifyResponse(response: any) {
  const code = String(response?.responseCode || '');
  const state = String(response?.params?.state || '').toUpperCase();
  const message = String(response?.responseMsg || '').toUpperCase();
  if (code === '2001' && state === 'APPROVED' && response?.params?.transactionId) return 'approved';
  if (['DECLINED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(state) || code === '5310' || code === '5206' || message.includes('INSUFFICIENT')) return 'declined';
  // An accepted/pending or unparseable response may still have charged the payer.
  if (!code || code === '2001' || ['PENDING', 'PROCESSING'].includes(state)) return 'unknown';
  return 'failed';
}
const unknownMessage = 'Xaaladda lacag-bixinta lama xaqiijin. Ha ku celin lacagta; la xiriir adeegga macaamiisha.';

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // Gateway JWT verification accepts the app's publishable/anon JWT, just like
  // the existing public storefront checkout. Merchant credentials stay server-side.
  if (!req.headers.get('Authorization')) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
  let transaction: any = null;
  try {
    const body = await req.json();
    const ref = String(body.client_reference || '');
    const payer = normalizePhone(body.payer_phone);
    const receiver = normalizePhone(body.receiver_phone);
    const packageId = String(body.package_id || '');
    const paymentProviderId = String(body.payment_provider_id || '');
    if (!UUID.test(ref) || !UUID.test(packageId) || !UUID.test(paymentProviderId) ||
        !/^\d{9}$/.test(payer) || !/^\d{7,9}$/.test(receiver)) {
      return json({ error: 'invalid_purchase_fields', message: 'Hubi lambarada iyo xirmada.' }, 422);
    }
    const { data: existing, error: lookupError } = await admin.from('waafipay_transactions').select('*').eq('client_reference', ref).maybeSingle();
    if (lookupError) throw lookupError;
    transaction = existing;
    if (transaction && (transaction.payer_phone !== payer || transaction.receiver_phone !== receiver ||
        transaction.package_id !== packageId || transaction.payment_provider_id !== paymentProviderId)) {
      return json({ error: 'reference_mismatch' }, 409);
    }
    if (transaction && transaction.status !== 'approved') {
      return json({ ...paymentFailure({ responseCode: transaction.response_code, responseMsg: transaction.response_message, params: { state: transaction.waafi_state } }, transaction.status), reference_id: transaction.reference_id }, 409);
    }
    const [{ data: pkg, error: pkgError }, { data: provider, error: providerError }] = await Promise.all([
      admin.from('data_packages_config').select('id,provider_id,category_id,package_name,data_amount,selling_price,cost_price,is_active,is_discovery_root,phone_prefix,ussd_code,menu1,menu2,sim_password').eq('id', packageId).maybeSingle(),
      admin.from('payment_providers_config').select('id,provider_name,is_active,payment_mode').eq('id', paymentProviderId).maybeSingle(),
    ]);
    if (pkgError || providerError) throw pkgError || providerError;
    if (!pkg || !pkg.is_active || !provider?.is_active || provider.payment_mode !== 'waafipay_api') {
      return json({ error: 'package_not_available', message: 'Xirmada ama WaafiPay ma shaqaynayo.' }, 404);
    }
    // Dynamic carrier-menu prices are not a fixed package price; never charge
    // the root package's placeholder amount for one of its discovered offers.
    if (pkg.is_discovery_root) return json({ error: 'discovery_api_not_supported', message: 'Xirmadan liiska shirkadda wali API laguma bixin karo. Dooro hab kale.' }, 422);
    const prefixes = String(pkg.phone_prefix || '').split(/[,/\s]+/).filter(Boolean);
    if (prefixes.length && !prefixes.some(p => receiver.startsWith(p))) return json({ error: 'invalid_receiver', message: 'Lambarka qaataha xirmadan kuma habboona.' }, 422);
    const { data: blocked } = await admin.rpc('is_phone_blocked', { p_phone: payer });
    if (blocked) return json({ error: 'blocked_payer', message: 'Lambarkan lacag-bixin looma oggola.' }, 403);
    const { data: providerConfig, error: configError } = await admin.from('providers_config').select('provider_name,is_active').eq('id', pkg.provider_id).maybeSingle();
    if (configError) throw configError;
    if (!providerConfig?.is_active) return json({ error: 'provider_not_available' }, 404);

    let scheduledFor = transaction?.raw_response?.request_context?.scheduled_for || body.scheduled_for || null;
    if (!transaction && scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) < Date.now() + 60000)) return json({ error: 'invalid_schedule' }, 422);
    const instruction = await getDeliveryInstruction(admin, pkg.provider_id, pkg.id, pkg.category_id);
    const { count: bundleCount, error: bundleError } = await admin.from('package_delivery_rules').select('id', { head: true, count: 'exact' }).eq('source_package_id', pkg.id).eq('is_active', true);
    if (bundleError) throw bundleError;
    if (!instruction?.code_template && !bundleCount) return json({ error: 'delivery_not_configured', message: 'Dirista xirmadan lama diyaarin. Lacag lagama jarin.' }, 409);
    if (!bundleCount) {
      const flow = applyFlow870PackageConfig(instruction.code_template, pkg, instruction);
      const code = buildUssdCode(flow.template, receiver, Number(pkg.cost_price), flow.pinCode || instruction.sim_password || '', pkg.ussd_code || '');
      if (isUssdMalformed(code).malformed) return json({ error: 'delivery_not_configured', message: 'Dirista xirmadan lama diyaarin.' }, 409);
    }
    const amount = transaction ? Number(transaction.amount) : Math.round(Number(pkg.selling_price) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid_package_price' }, 422);

    if (!transaction) {
      const since = new Date(Date.now() - 5 * 60000).toISOString();
      const { data: recent, error: rateError } = await admin.from('waafipay_transactions').select('status').eq('payer_phone', payer).gte('created_at', since);
      if (rateError) throw rateError;
      if ((recent || []).some(t => ['processing', 'unknown'].includes(t.status))) return json({ error: 'payment_status_unknown', message: unknownMessage }, 409);
      if ((recent || []).length >= 3) return json({ error: 'too_many_payment_attempts', message: 'Sug dhowr daqiiqo ka hor isku dayga xiga.' }, 429);
      // Retrieve Vault credentials only inside this function, never in responses/logs.
      const { data: credentials, error: credentialError } = await admin.rpc('waafipay_admin_credentials');
      if (credentialError) throw credentialError;
      if (!credentials?.api_key || !credentials.is_active) return json({ error: 'waafipay_inactive', message: 'WaafiPay hadda ma shaqaynayo.' }, 409);
      const reference = 'WP' + ref.replace(/-/g, '').slice(0, 18).toUpperCase();
      const requestId = crypto.randomUUID();
      const { data: inserted, error: insertError } = await admin.from('waafipay_transactions').insert({
        client_reference: ref, reference_id: reference, request_id: requestId, payer_phone: payer, receiver_phone: receiver,
        package_id: packageId, payment_provider_id: paymentProviderId, amount, currency: 'USD',
        environment: credentials.environment, status: 'processing', raw_response: { request_context: { scheduled_for: scheduledFor } },
      }).select('*').single();
      if (insertError?.code === '23505') return json({ error: 'payment_status_unknown', message: unknownMessage }, 409);
      if (insertError) throw insertError;
      transaction = inserted;
      let response: any;
      try {
        const result = await fetch(credentials.environment === 'sandbox' ? 'https://sandbox.waafipay.com/asm' : 'https://api.waafipay.net/asm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
          body: JSON.stringify({ schemaVersion: '1.0', requestId, timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
            channelName: 'WEB', serviceName: 'API_PURCHASE', serviceParams: {
              merchantUid: credentials.merchant_uid, apiUserId: credentials.api_user_id, apiKey: credentials.api_key,
              paymentMethod: 'MWALLET_ACCOUNT', payerInfo: { accountNo: '252' + payer },
              transactionInfo: { referenceId: reference, invoiceId: reference, amount: amount.toFixed(2), currency: 'USD', description: 'Al-islaam ' + pkg.package_name },
            } }),
        });
        if (!result.ok) throw new Error('Provider HTTP error');
        response = await result.json();
      } catch {
        await admin.from('waafipay_transactions').update({ status: 'unknown', error_message: 'Provider response could not be confirmed', updated_at: new Date().toISOString() }).eq('id', transaction.id);
        return json({ error: 'payment_status_unknown', message: unknownMessage, reference_id: reference }, 502);
      }
      let status = classifyResponse(response);
      const chargedAmount = Number(response.params?.txAmount);
      if (status === 'approved' && (!Number.isFinite(chargedAmount) || Math.abs(chargedAmount - amount) > 0.005)) status = 'unknown';
      const { data: updated, error: updateError } = await admin.from('waafipay_transactions').update({
        status, waafi_state: String(response.params?.state || ''), response_code: String(response.responseCode || ''),
        response_message: String(response.responseMsg || ''), waafi_transaction_id: response.params?.transactionId ? String(response.params.transactionId) : null,
        issuer_transaction_id: response.params?.issuerTransactionId ? String(response.params.issuerTransactionId) : null,
        // Store only non-secret fields; never store an upstream credentials echo.
        raw_response: { responseCode: response.responseCode, responseMsg: response.responseMsg,
          params: { state: response.params?.state, transactionId: response.params?.transactionId, txAmount: response.params?.txAmount },
          request_context: { scheduled_for: scheduledFor } },
        approved_at: status === 'approved' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }).eq('id', transaction.id).select('*').single();
      if (updateError) throw updateError;
      transaction = updated;
      if (status !== 'approved') return json({
        ...paymentFailure(response, status),
        reference_id: reference,
      }, status === 'unknown' ? 409 : 402);
    }

    let order: any = null;
    if (transaction.order_id) {
      const { data, error } = await admin.from('orders').select('id,delivery_status').eq('id', transaction.order_id).single();
      if (error) throw error;
      order = data;
    } else {
      const txId = 'waafipay:' + transaction.waafi_transaction_id;
      const { data: existingOrder, error: orderLookupError } = await admin.from('orders').select('id,delivery_status').eq('tx_id', txId).maybeSingle();
      if (orderLookupError) throw orderLookupError;
      order = existingOrder;
      if (!order) {
        const { data, error } = await admin.from('orders').insert({
          customer_phone: payer, sender_phone: payer, receiver_phone: receiver, provider_id: pkg.provider_id,
          package_id: pkg.id, package_name: pkg.package_name, data_amount: pkg.data_amount, selling_price: amount,
          cost_price: Number(pkg.cost_price || 0), payment_provider_id: paymentProviderId, payment_source: 'waafipay',
          status: 'completed', delivery_status: 'pending', tx_id: txId, scheduled_for: scheduledFor,
        }).select('id,delivery_status').single();
        if (error?.code === '23505') {
          const existingResult = await admin.from('orders').select('id,delivery_status').eq('tx_id', txId).single();
          if (existingResult.error) throw existingResult.error;
          order = existingResult.data;
        } else {
          if (error) throw error;
          order = data;
        }
      }
      // Exactly one request owns delivery dispatch after approval, including concurrent retries.
      const { data: claim, error: claimError } = await admin.from('waafipay_transactions').update({ order_id: order.id }).eq('id', transaction.id).is('order_id', null).select('id');
      if (claimError) throw claimError;
      if (claim?.length) {
        const slug = normalizeProviderSlug(providerConfig.provider_name);
        const bundled = await queueDeliveryWithBundling(admin, order.id, pkg.id, pkg.provider_id, receiver, slug, scheduledFor);
        if (bundled === null) {
          const flow = applyFlow870PackageConfig(instruction.code_template, pkg, instruction);
          const code = buildUssdCode(flow.template, receiver, Number(pkg.cost_price), flow.pinCode || instruction.sim_password || '', pkg.ussd_code || '');
          if (isUssdMalformed(code).malformed) throw new Error('Delivery template invalid');
          const { error } = await admin.from('delivery_queue').insert({
            order_id: order.id, provider_name: slug, ussd_code: code, receiver_phone: receiver, package_code: pkg.ussd_code,
            pin_code: flow.pinCode, status: scheduledFor ? 'scheduled' : 'pending', scheduled_at: scheduledFor || new Date().toISOString(),
          });
          if (error) throw error;
        }
      }
    }
    const queued = await hasActiveDelivery(admin, order.id);
    return json({ success: true, payment_approved: true, delivery_queued: queued, order_id: order.id, reference_id: transaction.reference_id });
  } catch {
    // Keep unknown/approved references for safe retry; never auto-fall back to USSD.
    if (transaction?.status === 'approved') return json({ success: true, payment_approved: true, delivery_queued: false,
      order_id: transaction.order_id || undefined, reference_id: transaction.reference_id,
      message: 'Lacagta waa la xaqiijiyey; dirista xirmada adeegga macaamiisha ha hubiyo.' }, 202);
    if (!transaction) return json({ error: 'payment_service_unavailable', error_type: 'general', title: 'Adeegga lacag-bixinta lama heli karo',
      message: 'Codsiga lacag-bixinta lama bilaabin. Sug wax yar, kadib isku day mar kale.', safe_to_retry: true }, 500);
    return json({ error: 'payment_status_unknown', message: unknownMessage, safe_to_retry: false }, 500);
  }
});
