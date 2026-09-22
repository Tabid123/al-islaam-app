import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSData {
  sender_phone: string;
  receiver_sim: string;
  amount: number;
  sms_body: string;
  tx_id?: string;
  sms_timestamp?: number;
}

/**
 * Normalize Somali phone number to canonical 9-digit local format
 */
function normalizeSomaliPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) {
    digits = digits.substring(3);
  }
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.substring(1);
  }
  return digits.slice(-9);
}

/**
 * Extract sender phone from SMS body text
 */
function extractSenderFromSmsBody(smsBody: string): string | null {
  if (!smsBody) return null;
  const patterns = [
    /ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /waxaad.*?ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+from\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /lacag\s+ayaad\s+ka\s+heshay\s*[:\s]*(\+?252\d{9}|\d{9,12})/i,
    /received\s+airtime\s+from\s+(\+?252\d{9}|\d{9,12})/i,
    /ka.*?heshay.*?(\+?252\d{9}|\d{9,12})/i,
  ];
  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match) return normalizeSomaliPhone(match[1]);
  }
  return null;
}

function normalizeSmsBodyForFingerprint(smsBody: string): string {
  return (smsBody || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeAmountForFingerprint(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '0';
  return String(Math.round(numericAmount * 100));
}

async function sha256Hex(value: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function extractTransactionReference(smsBody: string): string | null {
  if (!smsBody) return null;

  const patterns = [
    /(?:transaction|trans(?:action)?|trx|tx)\s*(?:id|ref|reference|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})/i,
    /(?:ref|reference|tixraac)\s*(?:id|number|no|#)?\s*[:=#-]?\s*([a-z0-9-]{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = smsBody.match(pattern);
    if (match?.[1]) {
      return match[1].trim().toUpperCase();
    }
  }

  return null;
}

async function buildStableReceiptTxId(senderPhone: string, amount: number, smsBody: string, _smsTimestamp?: number): Promise<string | null> {
  // CRITICAL: smsTimestamp is NOT included in the hash.
  // SmsReceiver and UssdDialerService report slightly different timestamps
  // for the same SMS, so including it would produce different tx_ids and
  // bypass deduplication. Hash is based on sender + amount + body only.
  if (!smsBody) return null;

  const payload = [
    normalizeSomaliPhone(senderPhone),
    normalizeAmountForFingerprint(amount),
    normalizeSmsBodyForFingerprint(smsBody),
  ].join('|');

  const hash = await sha256Hex(payload);
  return `sms_${hash.slice(0, 24)}`;
}

async function resolveExistingOrderByTxId(supabase: any, txId: string | null) {
  if (!txId) return null;

  const { data } = await supabase
    .from('orders')
    .select('id, status, delivery_status')
    .eq('tx_id', txId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function queueDirectDeliveryIfMissing(supabase: any, queueItem: Record<string, any>): Promise<boolean> {
  if (await hasActiveDelivery(supabase, queueItem.order_id)) {
    console.log('⚠️ Direct queue skipped — active delivery already exists for order:', queueItem.order_id);
    return false;
  }

  // Guard: refuse to queue malformed USSD (placeholder remnants like `(receiver_phone}`)
  const check = isUssdMalformed(queueItem.ussd_code || '');
  if (check.malformed) {
    console.error('🛑 Refusing to queue malformed USSD:', check.reason, 'order:', queueItem.order_id);
    await supabase.from('orders').update({
      delivery_status: 'failed',
      delivery_notes: check.reason || 'Template malformed',
    }).eq('id', queueItem.order_id);
    return false;
  }

  const { error } = await supabase.from('delivery_queue').insert(queueItem);
  if (error) throw error;
  return true;
}

async function hasActiveDelivery(supabase: any, orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from('delivery_queue')
    .select('id')
    .eq('order_id', orderId)
    .in('status', ['pending', 'processing', 'completed'])
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function pendingAlreadyMatched(supabase: any, pendingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('pending_online_payments')
    .select('id, status')
    .eq('id', pendingId)
    .single();
  return data?.status === 'matched';
}

function normalizeProviderSlug(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('hormuud')) return 'hormuud';
  if (lower.includes('somnet')) return 'somnet';
  if (lower.includes('somtel')) return 'somtel';
  if (lower.includes('amtel')) return 'amtel';
  if (lower.includes('somlink')) return 'somlink';
  return lower.split(' ')[0];
}

function formatAmountForUssd(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '0';
  if (Math.abs(numericAmount - Math.round(numericAmount)) < 0.000001) {
    return String(Math.round(numericAmount));
  }
  if (numericAmount < 1) {
    return numericAmount.toFixed(2).replace('.', '');
  }
  // For amounts >= 1 with decimals (e.g. 4.25 → "4*25")
  const wholePart = Math.floor(numericAmount);
  const fracPart = Math.round((numericAmount - wholePart) * 100);
  return `${wholePart}*${fracPart}`;
}

function splitMixedAmount(amount: number): number[] {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return [0];
  const wholePart = Math.floor(numericAmount);
  const fracPart = Math.round((numericAmount - wholePart) * 100) / 100;
  if (fracPart < 0.001) return [numericAmount];
  if (wholePart === 0) return [numericAmount];
  return [wholePart, fracPart];
}

function normalizePhoneForProvider(phone: string): string {
  let digits = (phone || '').replace(/^\+/, '');
  if (digits.startsWith('252')) digits = digits.substring(3);
  return digits.slice(-9);
}

function sanitizeUssdCode(ussd: string): string {
  const raw = (ussd || '').trim();
  const pipeIdx = raw.indexOf('|');
  // Preserve spaces in keyword menu suffix. Only the dialable USSD part should be compacted.
  const menuSuffix = pipeIdx >= 0 ? raw.substring(pipeIdx).replace(/#/g, '').trim() : '';
  let cleaned = (pipeIdx >= 0 ? raw.substring(0, pipeIdx) : raw).replace(/\s+/g, '').trim();
  cleaned = cleaned.replace(/^(\*\d+?)(\d{9})(\*)/, '$1*$2$3');
  cleaned = cleaned.replace(/\*{2,}/g, '*');
  if (cleaned && !cleaned.endsWith('#')) cleaned += '#';
  return `${cleaned}${menuSuffix}`;
}

function extractMenuSuffix(template?: string | null): string {
  const raw = String(template || '').trim();
  const pipeIdx = raw.indexOf('|');
  if (pipeIdx < 0) return '';
  const suffix = raw.substring(pipeIdx).trim();
  const fields = suffix.substring(1).split(',').map((field) => field.trim()).filter(Boolean);
  return fields.length > 0 && fields.every((field) => !field.includes('|')) ? suffix : '';
}

function hasMenuSuffix(template?: string | null): boolean {
  return extractMenuSuffix(template).length > 0;
}

function mergeTemplateMenuSuffix(template: string, fallbackTemplate?: string | null): string {
  const raw = String(template || '').trim();
  if (!raw || hasMenuSuffix(raw)) return raw;
  const fallbackSuffix = extractMenuSuffix(fallbackTemplate);
  return fallbackSuffix && raw.startsWith('*870*') ? `${raw}${fallbackSuffix}` : raw;
}

function cleanFlow870MenuField(value: unknown): string {
  return String(value || '').trim().replace(/[,|#]/g, '').trim();
}

function cleanPinDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function applyFlow870PackageConfig(template: string, pkg: any, instruction?: any): { template: string; pinCode: string | null } {
  const raw = String(template || '').trim();
  const isFlow870 = raw.startsWith('*870*');
  const pkgPin = cleanPinDigits(pkg?.sim_password);
  const instructionPin = cleanPinDigits(instruction?.sim_password);

  if (!isFlow870) {
    return { template: raw, pinCode: instructionPin || null };
  }

  const menu1 = cleanFlow870MenuField(pkg?.menu1);
  const menu2 = cleanFlow870MenuField(pkg?.menu2);
  let effectiveTemplate = raw;

  if (menu1 || menu2) {
    const pipeIdx = raw.indexOf('|');
    const base = pipeIdx < 0 ? raw : raw.substring(0, pipeIdx);
    effectiveTemplate = `${base}|${menu1 || '1'},${menu2 || '1'}`;
  }

  return { template: effectiveTemplate, pinCode: pkgPin || instructionPin || null };
}

function buildUssdCode(template: string, receiverPhone: string, costPrice: number, simPassword: string, packageCode = ''): string {
  return sanitizeUssdCode(
    template
      .replace(/\{receiver_phone\}/g, normalizePhoneForProvider(receiverPhone))
      .replace(/\{package_code\}/g, packageCode || '')
      .replace(/\{cost_price\}/g, formatAmountForUssd(Number(costPrice)))
      .replace(/\{sim_password\}/g, simPassword || '5516'),
  );
}

/**
 * Detect if a USSD string still contains unresolved template placeholders or
 * malformed brackets — these would otherwise be sent literally to the carrier.
 */
function isUssdMalformed(ussd: string): { malformed: boolean; reason?: string } {
  if (!ussd) return { malformed: true, reason: 'empty USSD' };
  const lower = ussd.toLowerCase();
  if (
    lower.includes('{') ||
    lower.includes('}') ||
    lower.includes('(') ||
    lower.includes(')') ||
    lower.includes('receiver_phone') ||
    lower.includes('cost_price') ||
    lower.includes('sim_password') ||
    lower.includes('package_code')
  ) {
    return { malformed: true, reason: `Template malformed: ${ussd}` };
  }
  return { malformed: false };
}

async function getDeliveryInstruction(supabase: any, providerId: string, packageId?: string | null, categoryId?: string | null) {
  const getSingleInstruction = async (query: any, scope: string) => {
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error(`❌ Delivery instruction lookup failed (${scope}):`, error);
      return null;
    }
    return data?.code_template ? data : null;
  };

  if (packageId) {
    const packageInstruction = await getSingleInstruction(
      supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).eq('package_id', packageId),
      'package',
    );
    if (packageInstruction) return packageInstruction;
  }

  if (categoryId) {
    const categoryInstruction = await getSingleInstruction(
      supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).eq('category_id', categoryId).is('package_id', null),
      'category',
    );
    if (categoryInstruction) return categoryInstruction;
  }

  return getSingleInstruction(
    supabase.from('delivery_instructions').select('code_template, sim_password').eq('provider_id', providerId).is('category_id', null).is('package_id', null),
    'provider',
  );
}

async function queueDeliveryWithBundling(supabase: any, orderId: string, sourcePackageId: string, providerId: string, receiverPhone: string, providerSlug: string) {
  if (await hasActiveDelivery(supabase, orderId)) {
    console.log('⚠️ Skipping bundled queue — active delivery already exists for order:', orderId);
    return [];
  }

  const { data: rules } = await supabase
    .from('package_delivery_rules')
    .select('*')
    .eq('source_package_id', sourcePackageId)
    .eq('is_active', true)
    .order('execution_order', { ascending: true });

  if (!rules || rules.length === 0) return null;

  console.log(`📦 Bundling rules found: ${rules.length} rules for package ${sourcePackageId}`);
  const queueItems: any[] = [];

  for (const rule of rules) {
    const { data: targetPkg } = await supabase.from('data_packages_config').select('*, category_id').eq('id', rule.target_package_id).single();
    if (!targetPkg) continue;

    const instruction = await getDeliveryInstruction(supabase, providerId, rule.target_package_id, targetPkg.category_id);
    if (!instruction?.code_template) continue;

    const costParts = splitMixedAmount(Number(targetPkg.cost_price));
    for (const costPart of costParts) {
      const flow870 = applyFlow870PackageConfig(instruction.code_template, targetPkg, instruction);
      const ussd = buildUssdCode(flow870.template, receiverPhone, costPart, flow870.pinCode || instruction.sim_password || '5516', targetPkg.ussd_code || '');
      const check = isUssdMalformed(ussd);
      if (check.malformed) {
        console.error('🛑 Bundled USSD malformed, skipping:', check.reason);
        await supabase.from('orders').update({
          delivery_status: 'failed',
          delivery_notes: check.reason || 'Template malformed',
        }).eq('id', orderId);
        return [];
      }
      for (let i = 0; i < rule.delivery_count; i++) {
        // If delay_minutes is 0 but delivery_count > 1, stagger by 1 minute each to prevent duplicate pending entries
        const effectiveDelayMs = rule.delay_minutes > 0 
          ? rule.delay_minutes * i * 60000 
          : (rule.delivery_count > 1 ? i * 60000 : 0);
        queueItems.push({
          order_id: orderId, provider_name: providerSlug, ussd_code: ussd,
          receiver_phone: receiverPhone, package_code: targetPkg.ussd_code,
          pin_code: flow870.pinCode,
          status: effectiveDelayMs === 0 ? 'pending' : 'scheduled',
          scheduled_at: new Date(Date.now() + effectiveDelayMs).toISOString(),
        });
      }
    }
  }

  if (queueItems.length > 0) {
    const { data: inserted, error: qErr } = await supabase.from('delivery_queue').insert(queueItems).select();
    if (qErr) console.error('❌ Bundled queue error:', qErr);
    else console.log(`📬 Bundled: ${inserted.length} deliveries queued`);
    return inserted;
  }
  return null;
}

/**
 * Resolve the actual receiving SIM phone number.
 * Android may send a provider name ("hormuud", "somnet") or an actual phone number.
 * We try to resolve it to the actual phone number using android_devices table.
 */
async function resolveReceiverSimNumber(supabase: any, receiverSim: string): Promise<string> {
  const normalized = normalizeSomaliPhone(receiverSim);
  
  // If it's already a valid phone number (9 digits, starts with valid prefix), return it
  if (normalized.length === 9 && /^[0-9]/.test(normalized)) {
    const firstTwo = normalized.substring(0, 2);
    if (['61', '62', '63', '64', '68', '69', '71', '77'].includes(firstTwo)) {
      return normalized;
    }
  }
  
  // It's a provider name - try to find the actual SIM number from android_devices
  const receiverLower = (receiverSim || '').toLowerCase().trim();
  console.log(`📡 receiver_sim "${receiverSim}" is a provider name, attempting to resolve actual SIM number`);
  
  // Check if any device has this as sim_number or sim2_number
  const { data: devices } = await supabase
    .from('android_devices')
    .select('sim_number, sim2_number, sim1_provider, sim2_provider')
    .eq('is_active', true)
    .is('archived_at', null);
  
  if (devices) {
    for (const device of devices) {
      // Match by provider name to SIM slot
      if (device.sim1_provider && device.sim1_provider.toLowerCase().includes(receiverLower) && device.sim_number) {
        const simNum = normalizeSomaliPhone(device.sim_number);
        if (simNum.length === 9) {
          console.log(`✅ Resolved receiver_sim "${receiverSim}" → SIM1: ${simNum}`);
          return simNum;
        }
      }
      if (device.sim2_provider && device.sim2_provider.toLowerCase().includes(receiverLower) && device.sim2_number) {
        const simNum = normalizeSomaliPhone(device.sim2_number);
        if (simNum.length === 9) {
          console.log(`✅ Resolved receiver_sim "${receiverSim}" → SIM2: ${simNum}`);
          return simNum;
        }
      }
    }
  }
  
  // Could not resolve - return the original
  console.log(`⚠️ Could not resolve receiver_sim "${receiverSim}" to a phone number`);
  return receiverLower;
}

/**
 * Determine the ROUTE for this SMS based on which SIM received it.
 * Returns: 'auto_topup' | 'payment' | 'unknown'
 */
async function determineRoute(supabase: any, resolvedSimNumber: string): Promise<'auto_topup' | 'payment' | 'unknown'> {
  const normalizedReceiver = normalizeSomaliPhone(resolvedSimNumber);
  const simVariants = [
    normalizedReceiver,
    `0${normalizedReceiver}`,
    `252${normalizedReceiver}`,
    `+252${normalizedReceiver}`,
  ];

  // AUTO TOP-UP IS A STRICT, INDEPENDENT ROUTE:
  // only money received by an active auto_topup_numbers line enters Auto Top-Up.
  const { data: autoTopupMatch } = await supabase
    .from('auto_topup_numbers')
    .select('id, phone_number')
    .in('phone_number', simVariants)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (autoTopupMatch) {
    console.log(`🔀 ROUTE: auto_topup (receiver SIM ${normalizedReceiver} is Auto Top-Up line ${autoTopupMatch.phone_number})`);
    return 'auto_topup';
  }

  // Normal payment route is separate from Auto Top-Up.
  const { data: paymentMatch } = await supabase
    .from('payment_providers_config')
    .select('id, payment_number')
    .in('payment_number', simVariants)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (paymentMatch) {
    console.log(`🔀 ROUTE: payment (receiver SIM ${normalizedReceiver} matches payment number ${paymentMatch.payment_number})`);
    return 'payment';
  }

  console.log(`🔀 ROUTE: unknown (receiver SIM ${normalizedReceiver} is neither Auto Top-Up nor payment number)`);
  return 'unknown';
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { sender_phone, receiver_sim, amount, sms_body, tx_id, sms_timestamp }: SMSData = await req.json();

    // ========================================
    // NORMALIZE SENDER PHONE
    // ========================================
    let normalizedSender = normalizeSomaliPhone(sender_phone);
    
    if (normalizedSender.length < 9) {
      const bodyExtracted = extractSenderFromSmsBody(sms_body);
      if (bodyExtracted && bodyExtracted.length === 9) {
        console.log('🔧 Sender extracted from SMS body:', { original: sender_phone, extracted: bodyExtracted });
        normalizedSender = bodyExtracted;
      }
    }
    
    const bodyExtracted = extractSenderFromSmsBody(sms_body);
    if (bodyExtracted && bodyExtracted.length === 9 && bodyExtracted !== normalizedSender) {
      console.log('🔧 Sender corrected from SMS body:', { metadata: normalizedSender, smsBody: bodyExtracted });
      normalizedSender = bodyExtracted;
    }

    const incomingTxId = tx_id?.trim() || null;
    const extractedTxReference = extractTransactionReference(sms_body);
    const stableTxId = await buildStableReceiptTxId(normalizedSender, amount, sms_body);
    // Priority: provider reference > stable content hash > client-sent tx_id
    const effectiveTxId = extractedTxReference || stableTxId || incomingTxId;

    // ========================================
    // RESOLVE RECEIVER SIM TO ACTUAL NUMBER
    // ========================================
    const resolvedSimNumber = await resolveReceiverSimNumber(supabase, receiver_sim);
    console.log('📱 SMS Received:', { sender_phone, normalizedSender, receiver_sim, resolvedSimNumber, amount, tx_id: incomingTxId, effectiveTxId, extractedTxReference });

    // ========================================
    // DETERMINE ROUTE: auto_topup vs payment vs unknown
    // ========================================
    const route = await determineRoute(supabase, resolvedSimNumber);
    console.log(`🛤️ Route determined: ${route}`);

    // ========================================
    // DUPLICATE CHECK 1: Check by tx_id  
    // ========================================
    if (effectiveTxId) {
      const { data: existingByTxId } = await supabase
        .from('payment_receipts')
        .select('id, matched_order_id')
        .eq('tx_id', effectiveTxId)
        .maybeSingle();

      if (existingByTxId) {
        const existingOrder = existingByTxId.matched_order_id ? { id: existingByTxId.matched_order_id } : await resolveExistingOrderByTxId(supabase, effectiveTxId);
        console.log('⚠️ Duplicate detected by tx_id:', effectiveTxId);
        return new Response(
          JSON.stringify({ success: true, message: 'SMS already processed (tx_id duplicate)', duplicate: true, order_id: existingOrder?.id || null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // TX_ID-based deduplication only — time-based checks removed
    // Duplicate prevention is handled by:
    // 1. DUPLICATE CHECK 1 above (tx_id on payment_receipts)
    // 2. DB unique index on payment_receipts.tx_id
    // 3. tx_id saved in orders table (unique_tx_id index)

    // STEP 1: Insert payment receipt with NORMALIZED sender + route info
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .insert({
        sender_phone: normalizedSender,
        receiver_sim: resolvedSimNumber.length >= 7 ? resolvedSimNumber : receiver_sim.toLowerCase(),
        amount,
        sms_body,
        tx_id: effectiveTxId,
        status: 'pending'
      })
      .select()
      .single();

    if (receiptError) {
      if (receiptError.code === '23505') {
        const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
        console.log('⚠️ Duplicate detected on insert (tx_id):', { effectiveTxId });
        return new Response(
          JSON.stringify({ success: true, message: 'SMS already processed (duplicate constraint)', duplicate: true, order_id: existingOrder?.id || null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      console.error('❌ Receipt insert error:', receiptError);
      throw receiptError;
    }

    console.log('💾 Receipt saved:', receipt.id);

    // ========================================
    // BLOCK CHECK
    // ========================================
    const { data: isBlocked } = await supabase.rpc('is_phone_blocked', { p_phone: normalizedSender });
    if (isBlocked) {
      console.log('🚫 Blocked user:', normalizedSender);
      const { data: blockInfo } = await supabase
        .from('blocked_users')
        .select('reason')
        .eq('phone_number', normalizedSender)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      await supabase.from('payment_receipts').update({
        status: 'blocked',
        admin_notes: `Blocked user: ${blockInfo?.reason || 'No reason'} | Route: ${route} | Sender: ${normalizedSender} | Receiver SIM: ${resolvedSimNumber} | Amount: $${amount}`
      }).eq('id', receipt.id);
      
      return new Response(
        JSON.stringify({ success: true, blocked: true, message: 'Sender is blocked - receipt saved' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // FRAUD DETECTION CHECK
    // ========================================
    try {
      await supabase.rpc('check_fraud_rules', { p_sender_phone: normalizedSender, p_amount: amount, p_receipt_id: receipt.id });
      console.log('🔍 Fraud check completed');
    } catch (fraudErr) {
      console.error('⚠️ Fraud check error (non-blocking):', fraudErr);
    }

    // ========================================
    // Helper: sender variants for matching
    // ========================================
    const senderVariants = [
      normalizedSender,
      `0${normalizedSender}`,
      `252${normalizedSender}`,
      `+252${normalizedSender}`,
    ];

    // ==========================================
    // ROUTE A: AUTO TOP-UP ONLY
    // SMS received on auto_topup_numbers SIM
    // → Return credit to sender, NEVER check online/offline orders
    // ==========================================
    if (route === 'auto_topup') {
      console.log('🔄 AUTO TOP-UP ROUTE — processing auto top-up only');
      
      // Re-resolve the exact Auto Top-Up line that received this payment.
      // Never fall back to another Auto Top-Up number.
      const normalizedReceiver = normalizeSomaliPhone(resolvedSimNumber);
      const simVariants = [
        normalizedReceiver,
        `0${normalizedReceiver}`,
        `252${normalizedReceiver}`,
        `+252${normalizedReceiver}`,
      ];
      const { data: autoTopupRecord } = await supabase
        .from('auto_topup_numbers')
        .select('*')
        .in('phone_number', simVariants)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!autoTopupRecord) {
        console.log('❌ No active auto_topup_number found');
        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Route: auto_topup | No active auto_topup_number found | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);
        return new Response(
          JSON.stringify({ success: false, message: 'No auto_topup number configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Detect provider from sender prefix
      const senderPrefix2 = normalizedSender.substring(0, 2);
      let providerSearch = '';
      if (senderPrefix2 === '61' || senderPrefix2 === '77') providerSearch = 'hormuud';
      else if (senderPrefix2 === '68') providerSearch = 'somnet';
      else if (senderPrefix2 === '62') providerSearch = 'somtel';
      else if (senderPrefix2 === '71') providerSearch = 'amtel';
      else providerSearch = 'hormuud';
      console.log(`📡 Sender prefix "${senderPrefix2}" → provider: ${providerSearch}`);

      const { data: detectedProvider } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .ilike('provider_name', `%${providerSearch}%`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!detectedProvider) {
        console.log(`⚠️ Auto top-up: provider not found for prefix "${senderPrefix2}"`);
        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Route: auto_topup | Provider not found for sender prefix "${senderPrefix2}" | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);
        return new Response(
          JSON.stringify({ success: true, message: 'Auto top-up: provider not detected', matching_strategy: 'auto_topup_no_provider' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Match ONLY packages configured under this exact Auto Top-Up number.
      // The sender's network prefix determines which provider package is eligible.
      const { data: matchingCustomPkgs, error: packageMatchError } = await supabase
        .from('auto_topup_packages')
        .select('*')
        .eq('topup_number_id', autoTopupRecord.id)
        .eq('selling_price', Number(amount))
        .eq('is_active', true)
        .ilike('provider_name', `%${providerSearch}%`)
        .order('created_at', { ascending: true })
        .limit(2);

      if (packageMatchError) {
        console.error('❌ Auto top-up package lookup failed:', packageMatchError);
        throw packageMatchError;
      }

      let customPkg: any = null;
      if ((matchingCustomPkgs || []).length === 1) {
        customPkg = matchingCustomPkgs![0];
      } else if ((matchingCustomPkgs || []).length > 1) {
        console.error(`❌ Auto top-up ambiguous: multiple packages match $${amount} for ${providerSearch}`);
        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Route: auto_topup | Multiple packages match $${amount} for ${providerSearch} on Auto Top-Up ${autoTopupRecord.phone_number}`
        }).eq('id', receipt.id);
        return new Response(
          JSON.stringify({ success: true, message: 'Auto top-up amount is ambiguous', matching_strategy: 'auto_topup_ambiguous_package' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      if (!customPkg) {
        console.log(`⚠️ Auto top-up: no package found for $${amount} on ${detectedProvider.provider_name}`);
        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Route: auto_topup | No package for $${amount} on ${detectedProvider.provider_name} (prefix: ${senderPrefix2}) | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);
        return new Response(
          JSON.stringify({ success: true, message: 'Auto top-up number matched but no package found', matching_strategy: 'auto_topup_no_package' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Look up real data_packages_config for delivery instructions
      const { data: realPkgs } = await supabase
        .from('data_packages_config')
        .select('*, category_id')
        .eq('provider_id', detectedProvider.id)
        .ilike('package_name', customPkg.package_name)
        .eq('is_active', true)
        .limit(1);
      
      const pkg = realPkgs && realPkgs.length > 0 ? realPkgs[0] : null;
      const packageName = customPkg.package_name;
      const dataAmount = customPkg.data_amount || (pkg?.data_amount || '');
      const packageId = pkg?.id || null;
      const categoryId = pkg?.category_id || null;
      const ussdCode = customPkg.ussd_code || pkg?.ussd_code || '';
      const costPrice = (customPkg.cost_price && customPkg.cost_price > 0) ? customPkg.cost_price : (pkg?.cost_price || customPkg.selling_price || amount);
      
      console.log(`✅ Auto top-up match: ${packageName} ($${amount}) for ${detectedProvider.provider_name} → receiver: ${normalizedSender} (sender)`);

      const { data: paymentProv } = await supabase
        .from('payment_providers_config')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      // Create order — receiver_phone = sender_phone (return credit to sender)
      const { data: autoOrder, error: autoOrderErr } = await supabase
        .from('orders')
        .insert({
          customer_phone: normalizedSender,
          sender_phone: normalizedSender,
          receiver_phone: normalizedSender,
          provider_id: detectedProvider.id,
          package_id: packageId,
          package_name: packageName,
          data_amount: dataAmount,
          selling_price: amount,
          cost_price: costPrice,
          payment_provider_id: paymentProv?.id,
          payment_number: autoTopupRecord.phone_number,
          payment_source: 'auto_topup',
          tx_id: effectiveTxId || null,
          status: 'completed',
          delivery_status: 'queued'
        })
        .select()
        .single();

      if (autoOrderErr) {
        if (autoOrderErr.code === '23505') {
          const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
          if (existingOrder) {
            await supabase.from('payment_receipts').update({
              status: 'matched',
              matched_order_id: existingOrder.id,
              matching_strategy: 'auto_topup_duplicate_tx',
              processed_at: new Date().toISOString(),
              admin_notes: `Route: auto_topup | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
            }).eq('id', receipt.id);

            return new Response(
              JSON.stringify({ success: true, duplicate: true, message: 'Auto top-up already processed', order_id: existingOrder.id, route: 'auto_topup' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
          }
        }
        console.error('❌ Auto top-up order error:', autoOrderErr);
        throw autoOrderErr;
      }

      console.log('📝 Auto top-up order created:', autoOrder.id);

      await supabase.from('payment_receipts').update({
        status: 'matched',
        matched_order_id: autoOrder.id,
        matching_strategy: 'auto_topup',
        processed_at: new Date().toISOString(),
        admin_notes: `Route: auto_topup | ${packageName} for sender ${normalizedSender} via ${detectedProvider.provider_name} | SIM: ${resolvedSimNumber}`
      }).eq('id', receipt.id);

      // Queue delivery — check auto_topup_delivery_rules first
      const providerSlug = normalizeProviderSlug(detectedProvider.provider_name);

      const { data: chainingRules } = await supabase
        .from('auto_topup_delivery_rules')
        .select('*')
        .eq('source_package_id', customPkg.id)
        .eq('is_active', true)
        .order('execution_order', { ascending: true });

      if (chainingRules && chainingRules.length > 0) {
        console.log(`🔗 Auto top-up rules found: ${chainingRules.length} targets for source pkg ${customPkg.id} — skipping source delivery`);
        const chainQueueItems: any[] = [];
        const skipReasons: string[] = [];
        
        for (const rule of chainingRules) {
          const { data: targetPkg } = await supabase.from('auto_topup_packages').select('*').eq('id', rule.target_package_id).maybeSingle();
          if (!targetPkg) {
            const r = `target package ${rule.target_package_id} not found`;
            console.error(`❌ Chain rule skipped: ${r}`);
            skipReasons.push(r);
            continue;
          }

          const targetCostPrice = (targetPkg.cost_price && targetPkg.cost_price > 0) ? targetPkg.cost_price : targetPkg.selling_price;
          const targetPkgNameTrim = (targetPkg.package_name || '').trim();

          const { data: targetRealPkgs } = await supabase
            .from('data_packages_config')
            .select('*, category_id')
            .eq('provider_id', detectedProvider.id)
            .ilike('package_name', targetPkgNameTrim)
            .eq('is_active', true)
            .limit(1);
          
          const targetRealPkg = targetRealPkgs && targetRealPkgs.length > 0 ? targetRealPkgs[0] : null;
          const targetUssdCode = targetPkg.ussd_code || targetRealPkg?.ussd_code || '';

          const targetInstruction = targetRealPkg
            ? await getDeliveryInstruction(supabase, detectedProvider.id, targetRealPkg.id, targetRealPkg.category_id)
            : await getDeliveryInstruction(supabase, detectedProvider.id, null, null);

          let targetFinalUssd = '';
          if (targetPkg.ussd_code) {
            const flow870 = applyFlow870PackageConfig(mergeTemplateMenuSuffix(targetPkg.ussd_code, targetInstruction?.code_template), targetRealPkg || targetPkg, targetInstruction);
            targetFinalUssd = buildUssdCode(flow870.template, normalizedSender, Number(targetCostPrice), flow870.pinCode || targetPkg.sim_password || targetInstruction?.sim_password || '5516', targetUssdCode);
          } else if (targetInstruction?.code_template) {
            const flow870 = applyFlow870PackageConfig(targetInstruction.code_template, targetRealPkg || targetPkg, targetInstruction);
            targetFinalUssd = buildUssdCode(flow870.template, normalizedSender, Number(targetCostPrice), flow870.pinCode || targetPkg.sim_password || targetInstruction?.sim_password || '5516', targetUssdCode);
          }

          const targetFlow870Pin = cleanPinDigits((targetRealPkg || targetPkg)?.sim_password) || cleanPinDigits(targetInstruction?.sim_password) || null;

          const malformed = isUssdMalformed(targetFinalUssd);
          if (!targetFinalUssd || malformed.malformed) {
            const r = `target "${targetPkgNameTrim}": ${malformed.reason || 'no USSD template'} (raw="${targetPkg.ussd_code || targetInstruction?.code_template || 'none'}")`;
            console.error(`❌ Chain rule skipped: ${r}`);
            skipReasons.push(r);
            continue;
          }

          console.log(`🔗 Chain target ready: ${targetPkgNameTrim} × ${rule.delivery_count} → ${targetFinalUssd}`);
          for (let i = 0; i < rule.delivery_count; i++) {
            // Stagger items so unique index (order_id, ussd_code, scheduled_at) does not collide.
            // If delay_minutes > 0, use that interval; otherwise stagger by 1 minute when delivery_count > 1.
            const effectiveDelayMs = rule.delay_minutes > 0
              ? rule.delay_minutes * (i + 1) * 60000
              : (rule.delivery_count > 1 ? i * 60000 : 0);
            chainQueueItems.push({
              order_id: autoOrder.id, provider_name: providerSlug, ussd_code: targetFinalUssd,
              receiver_phone: normalizedSender, package_code: targetUssdCode,
              pin_code: targetFlow870Pin,
              status: effectiveDelayMs === 0 ? 'pending' : 'scheduled',
              scheduled_at: new Date(Date.now() + effectiveDelayMs).toISOString(),
            });
          }
        }

        let totalChainedCost = 0;
        for (const rule of chainingRules) {
          const { data: tPkg } = await supabase.from('auto_topup_packages').select('cost_price, selling_price').eq('id', rule.target_package_id).maybeSingle();
          if (tPkg) totalChainedCost += ((tPkg.cost_price && tPkg.cost_price > 0) ? tPkg.cost_price : tPkg.selling_price) * rule.delivery_count;
        }

        if (chainQueueItems.length > 0) {
          const { data: inserted, error: qErr } = await supabase.from('delivery_queue').insert(chainQueueItems).select();
          if (qErr) {
            console.error('❌ Auto top-up chained queue insert error:', JSON.stringify(qErr));
            await supabase.from('orders').update({
              delivery_status: 'failed',
              delivery_notes: `Chain queue insert failed: ${qErr.message || JSON.stringify(qErr)}`
            }).eq('id', autoOrder.id);
          } else {
            console.log(`📬 Auto top-up: ${inserted?.length || 0} target deliveries queued (source skipped)`);
            if (totalChainedCost > 0) {
              await supabase.from('orders').update({ cost_price: totalChainedCost }).eq('id', autoOrder.id);
            }
          }
        } else {
          const note = `Delivery rules exist but no valid targets resolved: ${skipReasons.join(' | ') || 'unknown'}`;
          console.error(`❌ ${note}`);
          await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: note }).eq('id', autoOrder.id);
        }
      } else {
        // NO RULES → deliver source package directly
        console.log('ℹ️ No chaining rules — delivering source package directly');
        const instruction = packageId ? await getDeliveryInstruction(supabase, detectedProvider.id, packageId, categoryId) : null;
        let finalUssd = '';
        let finalPinCode: string | null = null;
        if (customPkg.ussd_code) {
          const flow870 = applyFlow870PackageConfig(mergeTemplateMenuSuffix(customPkg.ussd_code, instruction?.code_template), customPkg, instruction);
          finalPinCode = flow870.pinCode;
          finalUssd = buildUssdCode(flow870.template, normalizedSender, Number(costPrice), flow870.pinCode || customPkg.sim_password || instruction?.sim_password || '5516', ussdCode || '');
        } else if (instruction?.code_template) {
          const flow870 = applyFlow870PackageConfig(instruction.code_template, customPkg, instruction);
          finalPinCode = flow870.pinCode;
          finalUssd = buildUssdCode(flow870.template, normalizedSender, Number(costPrice), flow870.pinCode || customPkg.sim_password || instruction.sim_password || '5516', ussdCode || '');
        }
        if (finalUssd) {
          const queued = await queueDirectDeliveryIfMissing(supabase, { order_id: autoOrder.id, provider_name: providerSlug, ussd_code: finalUssd, receiver_phone: normalizedSender, package_code: ussdCode, pin_code: finalPinCode, status: 'pending' });
          if (queued) console.log('📬 Auto top-up delivery queued (direct)');
        } else {
          await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: 'No delivery instruction configured' }).eq('id', autoOrder.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Auto top-up matched and delivered', order_id: autoOrder.id, matching_strategy: 'auto_topup', route: 'auto_topup' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==========================================
    // ROUTE B: PAYMENT FLOW ONLY
    // SMS received on payment provider SIM
    // → Check pending_online_payments, legacy orders, offline_registrations
    // → NEVER do auto top-up
    // ==========================================
    if (route === 'payment') {
      console.log('💳 PAYMENT ROUTE — processing payment flow only');
    }

    // For payment route AND unknown route, proceed with payment matching
    // (unknown route also tries payment flow as best-effort)

    // ========================================
    // PRIORITY 0: Check pending_online_payments
    // ========================================
    const thirtyMinutesAgo = new Date(Date.now() - 1800000).toISOString();
    
    let pendingOnline = null;
    let pendingOnlineError = null;

    const { data: pendingBySenderPhone, error: err1 } = await supabase
      .from('pending_online_payments')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('status', 'pending')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingBySenderPhone) {
      pendingOnline = pendingBySenderPhone;
    } else {
      const { data: pendingBySender, error: err2 } = await supabase
        .from('pending_online_payments')
        .select('*')
        .in('verified_phone', senderVariants)
        .eq('status', 'pending')
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      pendingOnline = pendingBySender;
      pendingOnlineError = err2;
    }
    if (err1) pendingOnlineError = err1;

    if (pendingOnlineError) {
      console.error('❌ Error checking pending_online_payments:', pendingOnlineError);
    }

    if (pendingOnline) {
      const expectedAmount = Number(pendingOnline.expected_amount);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(expectedAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
        if (await pendingAlreadyMatched(supabase, pendingOnline.id)) {
          await supabase.from('payment_receipts').update({ status: 'duplicate', admin_notes: `Route: ${route} | Concurrent match - pending already processed` }).eq('id', receipt.id);
          return new Response(JSON.stringify({ success: true, message: 'Already matched (concurrent)', duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        const { data: lockResult } = await supabase
          .from('pending_online_payments')
          .update({ status: 'matched' })
          .eq('id', pendingOnline.id)
          .eq('status', 'pending')
          .select('id');
        
        if (!lockResult || lockResult.length === 0) {
          await supabase.from('payment_receipts').update({ status: 'duplicate', admin_notes: `Route: ${route} | Failed to lock pending payment` }).eq('id', receipt.id);
          return new Response(JSON.stringify({ success: true, message: 'Already claimed', duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        console.log('✅ Found pending online payment:', pendingOnline.id);
        
        const { data: packageData } = await supabase.from('data_packages_config').select('*, category_id').eq('id', pendingOnline.package_id).single();
        const { data: providerData } = await supabase.from('providers_config').select('provider_name').eq('id', pendingOnline.provider_id).single();
        const { data: paymentProvider } = await supabase.from('payment_providers_config').select('id, payment_number').eq('is_active', true).order('created_at', { ascending: true }).limit(1).single();

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_phone: normalizeSomaliPhone(pendingOnline.verified_phone || pendingOnline.sender_phone),
            sender_phone: normalizeSomaliPhone(pendingOnline.sender_phone || pendingOnline.verified_phone),
            receiver_phone: pendingOnline.receiver_phone,
            provider_id: pendingOnline.provider_id,
            package_id: pendingOnline.package_id,
            package_name: packageData?.package_name || 'Data Package',
            data_amount: packageData?.data_amount || '',
            selling_price: smsAmount,
            cost_price: Number(packageData?.cost_price || 0),
            payment_provider_id: paymentProvider?.id,
            payment_number: paymentProvider?.payment_number || '',
            payment_source: 'ussd_online',
            tx_id: effectiveTxId || null,
            status: 'completed',
            delivery_status: 'queued',
            scheduled_for: pendingOnline.scheduled_for || null,
            discovery_menu_label: packageData?.is_discovery_root ? (pendingOnline.discovery_menu_label || null) : null,
            discovery_root_id: packageData?.is_discovery_root ? pendingOnline.package_id : null,
          })
          .select()
          .single();

        if (orderError) {
          if (orderError.code === '23505') {
            const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
            if (existingOrder) {
              await supabase.from('payment_receipts').update({
                status: 'matched',
                matched_order_id: existingOrder.id,
                matching_strategy: 'pending_online_duplicate_tx',
                processed_at: new Date().toISOString(),
                admin_notes: `Route: ${route} | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
              }).eq('id', receipt.id);

              return new Response(
                JSON.stringify({ success: true, duplicate: true, message: 'Online payment already processed', order_id: existingOrder.id, route }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }
          }

          console.error('❌ Error creating order:', orderError);
          throw orderError;
        }

        console.log('📝 Order created from pending payment:', newOrder.id);

        await supabase.from('payment_receipts').update({
          status: 'matched',
          matched_order_id: newOrder.id,
          matching_strategy: 'pending_online_payment',
          processed_at: new Date().toISOString(),
          admin_notes: `Route: ${route} | ${packageData?.package_name} for ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);

        const isDiscoveryRoot = packageData?.is_discovery_root === true;
        const instruction = isDiscoveryRoot
          ? null
          : await getDeliveryInstruction(supabase, pendingOnline.provider_id, pendingOnline.package_id, packageData?.category_id);

        if (isDiscoveryRoot) {
          console.log('🔎 Discovery root order handed to the live discovery trigger:', newOrder.id);
        } else if (instruction && packageData) {
          const providerSlug = normalizeProviderSlug(providerData?.provider_name || '');
          const bundled = await queueDeliveryWithBundling(supabase, newOrder.id, pendingOnline.package_id, pendingOnline.provider_id, pendingOnline.receiver_phone, providerSlug);
          
          if (!bundled) {
            const flow870 = applyFlow870PackageConfig(instruction.code_template, packageData, instruction);
            const ussdCode = buildUssdCode(flow870.template, normalizePhoneForProvider(pendingOnline.receiver_phone), Number(packageData.cost_price), flow870.pinCode || instruction.sim_password || '5516', packageData.ussd_code || '');
            const scheduledAt = pendingOnline.scheduled_for
              ? new Date(pendingOnline.scheduled_for).toISOString()
              : new Date().toISOString();
            const queuedStatus = pendingOnline.scheduled_for && new Date(pendingOnline.scheduled_for).getTime() > Date.now()
              ? 'scheduled'
              : 'pending';
            try {
              const queued = await queueDirectDeliveryIfMissing(supabase, { order_id: newOrder.id, provider_name: providerSlug, ussd_code: ussdCode, receiver_phone: pendingOnline.receiver_phone, package_code: packageData.ussd_code, pin_code: flow870.pinCode, status: queuedStatus, scheduled_at: scheduledAt });
              if (queued) console.log(`📬 Online payment queued for delivery (scheduled_at=${scheduledAt}, status=${queuedStatus})`);
            } catch (queueError) {
              console.error('❌ Queue error:', queueError);
            }
          }
        } else {
          await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: 'No delivery instruction configured' }).eq('id', newOrder.id);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Pending online payment matched', order_id: newOrder.id, matching_strategy: 'pending_online_payment', route }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        // AMOUNT MISMATCH
        console.log('🚫 AMOUNT MISMATCH:', { expectedAmount, smsAmount });
        
        let intendedPackageName = 'Unknown';
        let intendedProviderName = 'Unknown';
        if (pendingOnline.package_id) {
          const { data: intendedPkg } = await supabase.from('data_packages_config').select('package_name, data_amount').eq('id', pendingOnline.package_id).maybeSingle();
          if (intendedPkg) intendedPackageName = `${intendedPkg.package_name} (${intendedPkg.data_amount})`;
        }
        if (pendingOnline.provider_id) {
          const { data: intendedProv } = await supabase.from('providers_config').select('provider_name').eq('id', pendingOnline.provider_id).maybeSingle();
          if (intendedProv) intendedProviderName = intendedProv.provider_name;
        }

        await supabase.from('payment_receipts').update({
          status: 'unmatched',
          admin_notes: `Route: ${route} | AMOUNT MISMATCH | Paid: $${smsAmount} | Expected: $${expectedAmount} | Intended Package: ${intendedPackageName} | Provider: ${intendedProviderName} | Receiver entered: ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`,
          processed_at: new Date().toISOString()
        }).eq('id', receipt.id);

        return new Response(
          JSON.stringify({ success: true, message: 'Amount mismatch — marked as unmatched', matching_strategy: 'amount_mismatch_blocked', route }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // ========================================
    // PRIORITY 1: Legacy pending_payment orders
    // ========================================
    const { data: pendingOrder } = await supabase
      .from('orders')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('status', 'pending_payment')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrder) {
      const orderAmount = Number(pendingOrder.selling_price);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(orderAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
        console.log('✅ Found pending online order:', pendingOrder.id);
        
        await supabase.from('payment_receipts').update({
          status: 'matched', matched_order_id: pendingOrder.id, matching_strategy: 'online_order_first',
          processed_at: new Date().toISOString(),
          admin_notes: `Route: ${route} | Legacy order ${pendingOrder.id} - ${pendingOrder.package_name} for ${pendingOrder.receiver_phone} | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);

        const { data: lockedLegacyOrder } = await supabase
          .from('orders')
          .update({ status: 'completed', delivery_status: 'queued', tx_id: pendingOrder.tx_id || effectiveTxId || null })
          .eq('id', pendingOrder.id)
          .eq('status', 'pending_payment')
          .select('id')
          .maybeSingle();

        if (!lockedLegacyOrder) {
          await supabase.from('payment_receipts').update({
            status: 'duplicate',
            matched_order_id: pendingOrder.id,
            matching_strategy: 'legacy_order_already_claimed',
            processed_at: new Date().toISOString(),
            admin_notes: `Route: ${route} | Legacy order ${pendingOrder.id} was already claimed | SIM: ${resolvedSimNumber}`,
          }).eq('id', receipt.id);

          return new Response(
            JSON.stringify({ success: true, duplicate: true, message: 'Legacy order already claimed', order_id: pendingOrder.id, route }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        const { data: orderPackage } = await supabase.from('data_packages_config').select('*, category_id').eq('id', pendingOrder.package_id).single();
        const isDiscoveryRoot = orderPackage?.is_discovery_root === true;
        const instruction = isDiscoveryRoot
          ? null
          : await getDeliveryInstruction(supabase, pendingOrder.provider_id, pendingOrder.package_id, orderPackage?.category_id);

        if (isDiscoveryRoot) {
          console.log('🔎 Existing discovery root order remains with the live discovery trigger:', pendingOrder.id);
        } else if (instruction && orderPackage) {
          const { data: providerData } = await supabase.from('providers_config').select('provider_name').eq('id', pendingOrder.provider_id).single();
          const providerSlug = normalizeProviderSlug(providerData?.provider_name || '');
          const bundled = await queueDeliveryWithBundling(supabase, pendingOrder.id, pendingOrder.package_id, pendingOrder.provider_id, pendingOrder.receiver_phone, providerSlug);
          if (!bundled) {
            const flow870 = applyFlow870PackageConfig(instruction.code_template, orderPackage, instruction);
            const ussdCode = buildUssdCode(flow870.template, normalizePhoneForProvider(pendingOrder.receiver_phone), Number(orderPackage.cost_price), flow870.pinCode || instruction.sim_password || '5516', orderPackage.ussd_code || '');
            await queueDirectDeliveryIfMissing(supabase, { order_id: pendingOrder.id, provider_name: providerSlug, ussd_code: ussdCode, receiver_phone: pendingOrder.receiver_phone, package_code: orderPackage.ussd_code, pin_code: flow870.pinCode, status: 'pending' });
          }
        } else {
          await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: 'No delivery instruction configured' }).eq('id', pendingOrder.id);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Online order matched', order_id: pendingOrder.id, matching_strategy: 'online_order_first', route }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // PRIORITY 1.5 (broad_pending_match) REMOVED — caused duplicate deliveries
    // Amount-only matching without sender verification is unsafe

    // ========================================
    // PRIORITY 2: Offline registrations
    // ========================================
    console.log('🔍 Checking offline registrations...');
    
    const { data: registration } = await supabase
      .from('offline_registrations')
      .select('*')
      .in('sender_phone', senderVariants)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!registration) {
      console.log('❌ No registration found for sender:', normalizedSender);
      await supabase.from('payment_receipts').update({ 
        status: 'unmatched',
        admin_notes: `Route: ${route} | No offline registration for sender ${normalizedSender} | SIM: ${resolvedSimNumber}`
      }).eq('id', receipt.id);

      return new Response(
        JSON.stringify({ success: false, message: 'No registration found for this sender', route }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Registration found:', { sender: registration.sender_phone, receiver: registration.receiver_phone, provider: registration.provider_name });

    // Find matching package
    const price = Number(amount);
    const min = Number((price - 0.005).toFixed(3));
    const max = Number((price + 0.005).toFixed(3));

    let { data: packages } = await supabase
      .from('data_packages_config')
      .select('*')
      .eq('provider_id', registration.provider_id)
      .eq('selling_price', price)
      .eq('is_active', true);

    // Iftin "Only Me" parity: exact private prices are matched after the public
    // selling price and before Al-islaam's legacy fuzzy fallback.
    if (!packages || packages.length === 0) {
      let { data: secretPackages } = await supabase
        .from('data_packages_config')
        .select('*')
        .eq('provider_id', registration.provider_id)
        .contains('secret_prices', [price])
        .eq('is_active', true)
        .limit(1);

      // Backward compatibility with the original single private-price field.
      if (!secretPackages || secretPackages.length === 0) {
        const { data: legacySecretPackages } = await supabase
          .from('data_packages_config')
          .select('*')
          .eq('provider_id', registration.provider_id)
          .eq('secret_price', price)
          .eq('is_active', true)
          .limit(1);
        secretPackages = legacySecretPackages || [];
      }

      if (secretPackages.length > 0) {
        console.log('🔒 Only Me price match:', secretPackages[0].package_name, price);
        packages = secretPackages;
      }
    }

    if (!packages || packages.length === 0) {
      const rangeRes = await supabase
        .from('data_packages_config')
        .select('*')
        .eq('provider_id', registration.provider_id)
        .eq('is_active', true)
        .gte('selling_price', min)
        .lte('selling_price', max)
        .order('selling_price', { ascending: true });
      packages = rangeRes.data ?? [];
    }

    if (!packages || packages.length === 0) {
      let crossProviderHint = '';
      const { data: otherPkgs } = await supabase
        .from('data_packages_config')
        .select('*, providers_config!inner(provider_name)')
        .eq('selling_price', price)
        .eq('is_active', true)
        .neq('provider_id', registration.provider_id)
        .limit(3);
      
      if (otherPkgs && otherPkgs.length > 0) {
        const otherProviders = [...new Set(otherPkgs.map((p: any) => p.providers_config?.provider_name))].join(', ');
        const pkgNames = otherPkgs.map((p: any) => p.package_name).join(', ');
        crossProviderHint = ` | ⚠️ waa xirmo ${otherProviders} ah (${pkgNames})`;
      }
      
      await supabase.from('payment_receipts').update({ 
        status: 'unmatched',
        admin_notes: `Route: ${route} | No package for $${amount} on ${registration.provider_name}${crossProviderHint} | SIM: ${resolvedSimNumber}`
      }).eq('id', receipt.id);

      return new Response(
        JSON.stringify({ success: false, message: `No package available for $${amount}`, route }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedPackage = packages[0];
    console.log('📦 Package found:', selectedPackage.package_name);

    const { data: paymentProvider } = await supabase
      .from('payment_providers_config')
      .select('id, payment_number')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const verifiedPhone = await (async () => {
      const { data: vp } = await supabase.from('verified_phones').select('phone_number').in('phone_number', senderVariants).limit(1).maybeSingle();
      return vp?.phone_number ? normalizeSomaliPhone(vp.phone_number) : normalizeSomaliPhone(registration.sender_phone);
    })();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_phone: verifiedPhone,
        sender_phone: normalizeSomaliPhone(registration.sender_phone),
        receiver_phone: registration.receiver_phone,
        provider_id: registration.provider_id,
        package_id: selectedPackage.id,
        package_name: selectedPackage.package_name,
        data_amount: selectedPackage.data_amount,
        selling_price: amount,
        cost_price: Number(selectedPackage.cost_price || 0),
        payment_provider_id: paymentProvider?.id,
        payment_number: paymentProvider?.payment_number || '',
        payment_source: 'sms_offline',
        tx_id: effectiveTxId || null,
        status: 'completed',
        delivery_status: 'queued'
      })
      .select()
      .single();

    if (orderError) {
      if (orderError.code === '23505') {
        const existingOrder = await resolveExistingOrderByTxId(supabase, effectiveTxId);
        if (existingOrder) {
          await supabase.from('payment_receipts').update({
            status: 'matched',
            matched_order_id: existingOrder.id,
            matching_strategy: 'offline_duplicate_tx',
            processed_at: new Date().toISOString(),
            admin_notes: `Route: ${route} | Duplicate tx_id reused existing order ${existingOrder.id} | SIM: ${resolvedSimNumber}`,
          }).eq('id', receipt.id);

          return new Response(
            JSON.stringify({ success: true, duplicate: true, message: 'Offline order already processed', order_id: existingOrder.id, route }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      }

      console.error('❌ Order creation error:', orderError);
      throw orderError;
    }

    console.log('📝 Order created:', order.id);

    const instruction = await getDeliveryInstruction(supabase, registration.provider_id, selectedPackage.id, selectedPackage.category_id);

    if (!instruction) {
      await supabase.from('orders').update({ delivery_status: 'failed', delivery_notes: 'No delivery instruction configured' }).eq('id', order.id);
      return new Response(JSON.stringify({ success: false, message: 'Delivery instruction not configured', route }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const providerSlug = normalizeProviderSlug(registration.provider_name);
    const bundled = await queueDeliveryWithBundling(supabase, order.id, selectedPackage.id, registration.provider_id, registration.receiver_phone, providerSlug);
    
    if (!bundled) {
      const flow870 = applyFlow870PackageConfig(instruction.code_template, selectedPackage, instruction);
      const ussdCode = buildUssdCode(flow870.template, normalizePhoneForProvider(registration.receiver_phone), Number(selectedPackage.cost_price), flow870.pinCode || instruction.sim_password || '5516', selectedPackage.ussd_code || '');
      try {
        await queueDirectDeliveryIfMissing(supabase, { order_id: order.id, provider_name: providerSlug, ussd_code: ussdCode, receiver_phone: registration.receiver_phone, package_code: selectedPackage.ussd_code, pin_code: flow870.pinCode, status: 'pending' });
      } catch (queueError) {
        console.error('❌ Queue error:', queueError);
        throw queueError;
      }
    }

    await supabase.from('payment_receipts').update({
      status: 'matched', matched_order_id: order.id, matching_strategy: 'offline_auto',
      processed_at: new Date().toISOString(),
      admin_notes: `Route: ${route} | ${selectedPackage.package_name} for ${registration.receiver_phone} | SIM: ${resolvedSimNumber}`
    }).eq('id', receipt.id);

    console.log('✅ Payment receipt matched');

    return new Response(
      JSON.stringify({ success: true, message: 'Order created and queued for delivery', order_id: order.id, package_name: selectedPackage.package_name, receiver_phone: registration.receiver_phone, route }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Error processing payment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
