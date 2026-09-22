const FLOW_PREFIXES = ['*870*', '*866*', '*212*', '*101*'];

export const isUssdFlowCode = (code?: string | null): boolean => {
  const normalized = String(code || '').trim();
  if (!normalized) return false;
  return normalized.startsWith('*101#') || FLOW_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

export const hasUssdFlowDelivery = (
  rows?: Array<{ ussd_code?: string | null }> | { ussd_code?: string | null } | null,
): boolean => {
  if (!rows) return false;
  const list = Array.isArray(rows) ? rows : [rows];
  return list.some(row => isUssdFlowCode(row?.ussd_code));
};

/**
 * Al-islaam profit parity with the Iftin USSD-flow rule:
 * - interactive USSD flows (*870*, *866*, *101*, *212*) => selling - cost
 * - all other orders keep Al-islaam's existing e-voucher calculation
 */
export const calculateAlIslaamProfit = (
  sellingPrice: number,
  costPrice: number,
  evoucherRate = 0,
  isFlow = false,
): number => {
  const selling = Number(sellingPrice || 0);
  const cost = Number(costPrice || 0);
  const rate = Number(evoucherRate || 0);

  if (isFlow) return selling - cost;
  return (selling * (1 + rate)) - cost;
};


export const NON_FINANCIAL_PAYMENT_SOURCES = new Set([
  'offline_unmatched_approved',
]);

export const isNonFinancialOrder = (
  order?: { payment_source?: string | null; is_financial?: boolean | null } | null,
): boolean => {
  if (!order) return false;
  if (order.is_financial === false) return true;
  return NON_FINANCIAL_PAYMENT_SOURCES.has(String(order.payment_source || '').toLowerCase());
};

