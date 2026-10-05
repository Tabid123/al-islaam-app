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
    .in('status', ['pending', 'processing', 'completed', 'scheduled'])
    .limit(1)
    .maybeSingle();
  return !!data;
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

async function queueDeliveryWithBundling(supabase: any, orderId: string, sourcePackageId: string, providerId: string, receiverPhone: string, providerSlug: string, scheduledFor: string | null = null) {
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
          status: !scheduledFor && effectiveDelayMs === 0 ? 'pending' : 'scheduled',
          scheduled_at: new Date((scheduledFor ? Date.parse(scheduledFor) : Date.now()) + effectiveDelayMs).toISOString(),
        });
      }
    }
  }

  if (queueItems.length > 0) {
    const { data: inserted, error: qErr } = await supabase.from('delivery_queue').insert(queueItems).select();
    if (qErr) throw qErr;
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
export { normalizeProviderSlug, getDeliveryInstruction, queueDeliveryWithBundling, applyFlow870PackageConfig, buildUssdCode, isUssdMalformed, hasActiveDelivery };
