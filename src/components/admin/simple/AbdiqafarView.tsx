// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { LazyFallback, EmptyState, SearchInput, formatPhone, formatDate, formatTime } from './shared';
import { CheckCircle, RotateCcw, ChevronDown, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useServerFn } from '@tanstack/react-start';
import { sendViaSomlink } from '@/lib/somlink.functions';
import { calculateAlIslaamProfit, hasUssdFlowDelivery, isUssdFlowCode, isNonFinancialOrder } from '@/lib/profit';
import type { DateRange } from 'react-day-picker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface DeliveryQueueItem {
  id: string;
  order_id: string;
  ussd_code: string;
  provider_response: string | null;
  sim_slot: number | null;
  android_device_id: string | null;
  status: string;
  created_at: string;
  provider_name?: string;
  receiver_phone?: string;
  package_code?: string | null;
  pin_code?: string | null;
}

interface OrderDetail {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  status: string;
  delivery_status: string;
  delivery_notes: string | null;
  created_at: string;
  delivered_at: string | null;
  provider_id: string;
  package_id?: string | null;
  payment_source?: string | null;
  provider_name?: string;
  evoucher_rate?: number;
  is_flow?: boolean;
  deliveries: DeliveryQueueItem[];
  device_name?: string;
  sim_number?: string;
  source: 'online' | 'offline' | 'autotop';
}

const DetailRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 min-w-[100px]">{label}</span>
    <span className={`text-[11px] text-right flex-1 ml-2 ${bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{value}</span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const colors = status === 'delivered' ? 'bg-green-500 text-white' :
    status === 'failed' || status === 'timeout' ? 'bg-red-500 text-white' :
    status === 'pending' ? 'bg-yellow-400 text-yellow-900' :
    status === 'processing' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white';
  const label = status === 'delivered' ? 'Successfully' : status === 'failed' ? 'Failed' :
    status === 'timeout' ? 'Timeout' : status === 'pending' ? 'Pending' :
    status === 'processing' ? 'Processing' : status;
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colors}`}>{label}</span>;
};

// Compute Mogadishu-midnight range for a given period or custom date.
function computeRange(period: 'today' | 'week' | 'month' | 'year', range?: DateRange): { startISO: string; endISO: string } {
  const MOG_OFFSET = 3;
  if (range?.from) {
    const f = range.from;
    const t = range.to || range.from;
    const start = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), -MOG_OFFSET));
    const end = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() + 1, -MOG_OFFSET));
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  const now = new Date();
  const mogNow = new Date(now.getTime() + MOG_OFFSET * 3600 * 1000);
  const my = mogNow.getUTCFullYear(), mm = mogNow.getUTCMonth(), md = mogNow.getUTCDate();
  let start = new Date(Date.UTC(my, mm, md, -MOG_OFFSET));
  const end = new Date(now.getTime() + 60 * 1000);
  if (period === 'week') start = new Date(start.getTime() - 6 * 86400000);
  else if (period === 'month') start = new Date(Date.UTC(my, mm, 1, -MOG_OFFSET));
  else if (period === 'year') start = new Date(Date.UTC(my, 0, 1, -MOG_OFFSET));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export const AbdiqafarView = ({ isSo }: { isSo: boolean }) => {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'delivered' | 'failed'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'offline' | 'autotop'>('all');
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'retry' | 'deliver'; order: OrderDetail } | null>(null);
  const [retryPhone, setRetryPhone] = useState('');
  const [catalogProviders, setCatalogProviders] = useState<any[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<any[]>([]);
  const [catalogPackages, setCatalogPackages] = useState<any[]>([]);
  const [retryProviderId, setRetryProviderId] = useState('');
  const [retryCategoryId, setRetryCategoryId] = useState('');
  const [retryPackageId, setRetryPackageId] = useState('');
  const runSomlink = useServerFn(sendViaSomlink);

  const { startISO, endISO } = useMemo(() => computeRange(period, dateRange), [period, dateRange]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, deliveryRes, providersRes, devicesRes, packagesRes, categoriesRes] = await Promise.all([
        supabase.from('orders').select('*')
          .gte('created_at', startISO).lt('created_at', endISO)
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('delivery_queue')
          .select('id, order_id, ussd_code, provider_response, sim_slot, android_device_id, status, created_at, provider_name, receiver_phone, package_code, pin_code')
          .gte('created_at', startISO).lt('created_at', endISO),
        supabase.from('providers_config').select('id, provider_name, evoucher_rate').eq('is_active', true).order('display_order'),
        supabase.from('android_devices').select('device_id, device_name, sim_number, sim2_number'),
        supabase.from('data_packages_config').select('id, provider_id, category_id, package_name, data_amount, selling_price, cost_price, ussd_code, sim_password, menu1, menu2, somlink_bundle_id, is_discovery_root, is_active').eq('is_active', true).order('display_order').limit(500),
        supabase.from('package_categories').select('id, provider_id, category_name, is_active, display_order').eq('is_active', true).order('display_order'),
      ]);

      const deliveries = (deliveryRes.data || []) as DeliveryQueueItem[];
      const providers = providersRes.data || [];
      const devices = devicesRes.data || [];
      const allPackages = packagesRes.data || [];
      const allCategories = categoriesRes.data || [];
      setCatalogProviders(providers);
      setCatalogPackages(allPackages);
      setCatalogCategories(allCategories);
      const packageById = new Map(allPackages.map((pkg: any) => [pkg.id, pkg]));

      const enriched: OrderDetail[] = (ordersRes.data || []).map(o => {
        const orderDeliveries = deliveries.filter(d => d.order_id === o.id);
        const firstDq = orderDeliveries[0];
        const prov = providers.find(p => p.id === o.provider_id);
        const dev = firstDq ? devices.find(d => d.device_id === firstDq.android_device_id) : null;
        const ps = ((o as any).payment_source || '').toLowerCase();
        const source: 'online' | 'offline' | 'autotop' =
          ps.includes('auto') ? 'autotop' :
          /offline|sms/.test(ps) ? 'offline' : 'online';
        const pkg = packageById.get(o.package_id);
        const storedCost = Number(o.cost_price || 0);
        const effectiveCost = storedCost > 0 ? storedCost : Number(pkg?.cost_price || 0);
        const isFlow = Boolean((o as any).discovery_root_id) ||
          Boolean(pkg?.is_discovery_root) ||
          hasUssdFlowDelivery(orderDeliveries) ||
          isUssdFlowCode(pkg?.ussd_code);
        return {
          ...o,
          cost_price: effectiveCost,
          provider_name: prov?.provider_name || 'Unknown',
          evoucher_rate: Number(prov?.evoucher_rate || 0),
          is_flow: isFlow,
          deliveries: orderDeliveries,
          device_name: dev?.device_name,
          sim_number: firstDq?.sim_slot === 2 ? dev?.sim2_number : dev?.sim_number,
          source,
        };
      });

      setOrders(enriched);
    } catch (err) {
      console.error('Abdiqafar load error:', err);
    } finally {
      setLoading(false);
    }
  }, [startISO, endISO]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders', 'delivery_queue'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = orders.filter(o => {
    if (sourceFilter !== 'all' && o.source !== sourceFilter) return false;
    if (filter === 'pending') return o.delivery_status === 'pending' || o.delivery_status === 'processing';
    if (filter === 'delivered') return o.delivery_status === 'delivered';
    if (filter === 'failed') return o.delivery_status === 'failed' || o.delivery_status === 'timeout';
    return true;
  }).filter(o => !search ||
    o.receiver_phone?.includes(search) ||
    o.sender_phone?.includes(search) ||
    o.customer_phone?.includes(search) ||
    o.package_name?.toLowerCase().includes(search.toLowerCase())
  );

  const markDelivered = async (id: string) => {
    await supabase.from('orders').update({ delivery_status: 'delivered', delivered_at: new Date().toISOString(), delivery_notes: 'Manually verified - Abdiqafar' }).eq('id', id);
    toast.success(isSo ? 'Waa la dhameeyay' : 'Marked as delivered');
    loadOrders();
  };

  const getRetryInstruction = async (providerId: string, categoryId?: string | null, packageId?: string | null) => {
    const pickOne = async (query: any) => {
      const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data || null;
    };
    if (packageId) {
      const row = await pickOne(
        supabase.from('delivery_instructions')
          .select('code_template, ussd_code, sim_password')
          .eq('provider_id', providerId)
          .eq('package_id', packageId)
      );
      if (row?.code_template || row?.ussd_code) return row;
    }
    if (categoryId) {
      const row = await pickOne(
        supabase.from('delivery_instructions')
          .select('code_template, ussd_code, sim_password')
          .eq('provider_id', providerId)
          .eq('category_id', categoryId)
          .is('package_id', null)
      );
      if (row?.code_template || row?.ussd_code) return row;
    }
    return pickOne(
      supabase.from('delivery_instructions')
        .select('code_template, ussd_code, sim_password')
        .eq('provider_id', providerId)
        .is('category_id', null)
        .is('package_id', null)
    );
  };

  // Retry the SAME order: do not create a new order, only re-queue delivery.
  // Admin may correct receiver and optionally replace provider/category/package.
  const retryOrder = async (id: string, overridePhone?: string, overridePackageId?: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) { toast.error(isSo ? 'Dalabkii lama helin' : 'Order not found'); return; }

    const newReceiver = (overridePhone || order.receiver_phone || '').replace(/\D/g, '');
    if (!newReceiver) { toast.error(isSo ? 'Lambar sax ah geli' : 'Enter a valid phone'); return; }

    const selectedPkg = overridePackageId
      ? catalogPackages.find((p: any) => p.id === overridePackageId)
      : catalogPackages.find((p: any) => p.id === order.package_id);

    if (!selectedPkg) {
      toast.error(isSo ? 'Dooro xirmo sax ah' : 'Select a valid package');
      return;
    }

    const provider = catalogProviders.find((p: any) => p.id === selectedPkg.provider_id);
    const providerName = provider?.provider_name || order.provider_name || 'unknown';
    const instruction = await getRetryInstruction(selectedPkg.provider_id, selectedPkg.category_id, selectedPkg.id);
    const template = String(
      selectedPkg.ussd_code ||
      instruction?.code_template ||
      instruction?.ussd_code ||
      ''
    ).trim();

    const somlinkBundleId = selectedPkg.somlink_bundle_id != null ? Number(selectedPkg.somlink_bundle_id) : null;
    const isSomlink = providerName.toLowerCase().includes('somlink') && !!somlinkBundleId;

    const updateOrderPayload: any = {
      receiver_phone: newReceiver,
      provider_id: selectedPkg.provider_id,
      package_id: selectedPkg.id,
      package_name: selectedPkg.package_name,
      data_amount: selectedPkg.data_amount || '',
      selling_price: Number(selectedPkg.selling_price || 0),
      cost_price: Number(selectedPkg.cost_price || 0),
      delivery_status: 'pending',
      delivery_notes: 'Manual retry — package/receiver may have been changed',
      discovery_root_id: selectedPkg.is_discovery_root ? selectedPkg.id : null,
      discovery_menu_label: null,
    };

    if (isSomlink) {
      const { error: orderUpdateErr } = await supabase.from('orders').update(updateOrderPayload).eq('id', id);
      if (orderUpdateErr) {
        toast.error('Error: ' + orderUpdateErr.message);
        return;
      }
      const { data: newQ, error: sErr } = await supabase
        .from('delivery_queue')
        .insert({
          order_id: id,
          provider_name: 'Somlink',
          receiver_phone: newReceiver,
          package_code: String(somlinkBundleId),
          status: 'processing',
          last_attempt_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (sErr || !newQ) { toast.error('Error: ' + (sErr?.message || 'queue')); return; }
      try {
        const res: any = await runSomlink({ data: { queueId: newQ.id } });
        if (res?.success === false) toast.error(res?.message || (isSo ? 'Dirista way fashilantay' : 'Send failed'));
        else toast.success(isSo ? 'Dib waa loo diray (Somlink)' : 'Re-sent via Somlink');
      } catch (e: any) {
        toast.error('Somlink: ' + (e?.message || 'error'));
      }
      loadOrders();
      return;
    }

    if (!template) {
      toast.error(isSo ? 'Xirmadan delivery code ma leh' : 'Selected package has no delivery code');
      return;
    }

    const formatAmount = (value: any) => {
      const n = Number(value || 0);
      if (!Number.isFinite(n)) return '0';
      if (Math.abs(n - Math.round(n)) < 0.000001) return String(Math.round(n));
      const [whole, frac] = n.toFixed(2).split('.');
      if (whole === '0') return `0${frac}`;
      return `${whole}*${frac}`;
    };

    const pin = String(selectedPkg.sim_password || instruction?.sim_password || '').replace(/\D/g, '');
    let newUssd = template
      .replace(/\{receiver_phone\}/g, newReceiver)
      .replace(/\{customer_phone\}/g, order.customer_phone || newReceiver)
      .replace(/\{cost_price\}/g, formatAmount(selectedPkg.cost_price))
      .replace(/\{price\}|\{amount\}/g, formatAmount(selectedPkg.selling_price))
      .replace(/\{data_amount\}/g, selectedPkg.data_amount || '')
      .replace(/\{package_name\}/g, selectedPkg.package_name || '')
      .replace(/\{package_code\}/g, selectedPkg.ussd_code || '')
      .replace(/\{sim_password\}|\{password\}/g, pin);

    const menu1 = String(selectedPkg.menu1 || '').trim().replace(/[,|#]/g, '').trim();
    const menu2 = String(selectedPkg.menu2 || '').trim().replace(/[,|#]/g, '').trim();
    const isMenuFlow = /^\*(870|866|101|212)/.test(newUssd.trim());
    if (isMenuFlow && (menu1 || menu2) && !newUssd.includes('|')) {
      newUssd = `${newUssd}|${menu1 || '1'},${menu2 || '1'}`;
    }

    const unresolved = /\{[^}]+\}/.test(newUssd);
    if (unresolved) {
      toast.error(isSo ? 'Delivery code-ka xirmada placeholders ayaa ka maqan' : 'Selected package delivery code has unresolved placeholders');
      return;
    }

    const { error: orderUpdateErr } = await supabase.from('orders').update(updateOrderPayload).eq('id', id);
    if (orderUpdateErr) {
      toast.error('Error: ' + orderUpdateErr.message);
      return;
    }

    const payload: any = {
      order_id: id,
      provider_name: providerName.toLowerCase(),
      ussd_code: newUssd,
      receiver_phone: newReceiver,
      package_code: selectedPkg.ussd_code || null,
      pin_code: pin || null,
      status: 'pending',
      scheduled_at: new Date(Date.now() + 1500).toISOString(),
    };

    const { error: qErr } = await supabase.from('delivery_queue').insert(payload);
    if (qErr) { toast.error('Error: ' + qErr.message); return; }

    toast.success(isSo ? 'Xirmada cusub dib ayaa loo dirayaa' : 'Selected package re-queued');
    loadOrders();
  };

  const pendingCount = orders.filter(o => o.delivery_status === 'pending' || o.delivery_status === 'processing').length;
  const deliveredCount = orders.filter(o => o.delivery_status === 'delivered').length;
  const failedCount = orders.filter(o => o.delivery_status === 'failed' || o.delivery_status === 'timeout').length;

  const rangeLabel = dateRange?.from
    ? (dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
        ? `${format(dateRange.from, 'dd/MM/yy')} → ${format(dateRange.to, 'dd/MM/yy')}`
        : format(dateRange.from, 'dd/MM/yy'))
    : null;
  const periodLabel = rangeLabel ||
    (period === 'today' ? (isSo ? 'Maanta' : 'Today') :
    period === 'week' ? (isSo ? 'Isbuucan' : 'Week') :
    period === 'month' ? (isSo ? 'Bishan' : 'Month') : (isSo ? 'Sanadkan' : 'Year'));

  return (
    <div className="space-y-3">
      {/* Period / Date picker */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
        {(['today', 'week', 'month', 'year'] as const).map(p => (
          <button key={p}
            onClick={() => { setPeriod(p); setDateRange(undefined); }}
            className={`px-3 py-1 text-[11px] font-medium rounded-full whitespace-nowrap shrink-0 ${
              period === p && !dateRange ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}>
            {p === 'today' ? (isSo ? 'Maanta' : 'Today') : p === 'week' ? (isSo ? 'Isbuucan' : 'Week') : p === 'month' ? (isSo ? 'Bishan' : 'Month') : (isSo ? 'Sanadkan' : 'Year')}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`px-3 py-1 text-[11px] font-medium rounded-full flex items-center gap-1 shrink-0 ${
              dateRange ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}>
              <CalendarIcon className="w-3 h-3" />
              {rangeLabel || '📅'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={dateRange}
              onSelect={(r) => setDateRange(r)}
              numberOfMonths={1}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn('p-3 pointer-events-auto')} />
            {dateRange && (
              <div className="p-2 border-t flex justify-end">
                <button onClick={() => setDateRange(undefined)} className="text-[11px] text-blue-600 font-medium">
                  {isSo ? 'Tirtir' : 'Clear'}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setFilter('all')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{orders.length}</div>
          {isSo ? 'Wadarta' : 'All'}
        </button>
        <button onClick={() => setFilter('pending')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'pending' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{pendingCount}</div>
          {isSo ? 'Sugaya' : 'Pending'}
        </button>
        <button onClick={() => setFilter('delivered')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'delivered' ? 'bg-green-500 text-white border-green-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{deliveredCount}</div>
          {isSo ? 'Guul' : 'Done'}
        </button>
        <button onClick={() => setFilter('failed')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'failed' ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{failedCount}</div>
          {isSo ? 'Fashil' : 'Failed'}
        </button>
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-gray-500">{isSo ? 'Isha:' : 'Source:'}</span>
        {(['all', 'online', 'offline', 'autotop'] as const).map(s => (
          <button key={s} onClick={() => setSourceFilter(s)}
            className={`px-2.5 py-0.5 rounded-full font-medium ${
              sourceFilter === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}>
            {s === 'all' ? (isSo ? 'Dhammaan' : 'All') : s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : 'AutoTop'}
          </button>
        ))}
        <span className="ml-auto text-gray-400 text-[10px]">{periodLabel}</span>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />

      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-3">
          <div className="bg-blue-500 text-white px-3 py-2 rounded-t-lg grid grid-cols-3 text-[10px] font-bold">
            <span>Sender</span>
            <span className="text-center">Recharge</span>
            <span className="text-right">Price</span>
          </div>

          {filtered.map((order) => {
            const profit = isNonFinancialOrder(order) ? 0 : calculateAlIslaamProfit(
              Number(order.selling_price || 0),
              Number(order.cost_price || 0),
              Number(order.evoucher_rate || 0),
              Boolean(order.is_flow),
            );
            const displayStatus = order.delivery_status || order.status;
            const isExpanded = expandedId === order.id;

            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full grid grid-cols-3 items-center px-3 py-2.5 text-left active:bg-gray-50 dark:active:bg-gray-750"
                >
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${displayStatus === 'delivered' ? 'bg-green-500' : displayStatus === 'failed' || displayStatus === 'timeout' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                    <span className="text-[11px] font-medium text-gray-800 dark:text-white truncate">{formatPhone(order.sender_phone || order.customer_phone)}</span>
                    <span className={`text-[8px] px-1 py-px rounded-full font-bold ${
                      order.source === 'offline' ? 'bg-orange-100 text-orange-700' :
                      order.source === 'autotop' ? 'bg-cyan-100 text-cyan-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {order.source === 'offline' ? 'OFF' : order.source === 'autotop' ? 'AUTO' : 'ON'}
                    </span>
                  </div>
                  <span className="text-[11px] text-center font-medium text-gray-800 dark:text-white">{formatPhone(order.receiver_phone)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">${Number(order.selling_price).toFixed(2)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <>
                    <div className="px-3 border-t border-gray-100 dark:border-gray-700">
                      <DetailRow label="Source" value={order.source === 'offline' ? 'Offline (SMS)' : order.source === 'autotop' ? 'Auto Top-Up' : 'Online'} />
                      <DetailRow label="Business" value={order.provider_name || 'N/A'} />
                      {order.sim_number && <DetailRow label="AccNo" value={`SIM_${order.sim_number}`} />}
                      <DetailRow label="Data" value={`$${Number(order.cost_price || 0).toFixed(2)}`} />
                      <DetailRow label="Network" value={order.package_name} bold />
                      <DetailRow label="Profit" value={`$${profit < 0.01 && profit > 0 ? profit.toFixed(3) : profit.toFixed(2)}`} bold />
                      {order.device_name && <DetailRow label="Device" value={order.device_name} />}
                      {order.sim_number && <DetailRow label="SimNO" value={order.sim_number} />}
                      <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Status</span>
                        <StatusBadge status={displayStatus} />
                      </div>
                      <DetailRow label="Process Time" value={order.delivered_at ? `${formatTime(order.delivered_at)} ${formatDate(order.delivered_at)}` : '—'} />

                      {order.deliveries.length > 0 && (
                        <div className="py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                            📩 SMS ({order.deliveries.length})
                          </span>
                          <div className="space-y-1.5 mt-1">
                            {order.deliveries.map((dq) => (
                              <div key={dq.id} className={`p-2 rounded border text-[10px] whitespace-pre-wrap ${
                                dq.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-gray-700 dark:text-gray-300' :
                                dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-gray-700 dark:text-gray-300' :
                                'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-gray-500">USSD: {dq.ussd_code}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                    dq.status === 'completed' ? 'bg-green-500 text-white' :
                                    dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-500 text-white' :
                                    'bg-yellow-400 text-yellow-900'
                                  }`}>{dq.status}</span>
                                </div>
                                {dq.provider_response ? (
                                  <span>"{dq.provider_response}"</span>
                                ) : (
                                  <span className="italic text-gray-400">Jawaab lama helin</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <DetailRow label="Create Time" value={`${formatTime(order.created_at)} ${formatDate(order.created_at)}`} />
                      <DetailRow label="ID" value={order.id.slice(0, 8)} />
                    </div>

                    <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                      {displayStatus === 'pending' && (
                        <button onClick={() => setConfirmAction({ kind: 'deliver', order })} className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" /> Dhamee
                        </button>
                      )}
                      <button onClick={() => {
                        const currentPkg = catalogPackages.find((p: any) => p.id === order.package_id);
                        setRetryPhone(order.receiver_phone || '');
                        setRetryProviderId(order.provider_id || currentPkg?.provider_id || '');
                        setRetryCategoryId(currentPkg?.category_id || '');
                        setRetryPackageId(order.package_id || '');
                        setConfirmAction({ kind: 'retry', order });
                      }} className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-[10px] font-bold">
                        <RotateCcw className="w-3 h-3" /> {isSo ? 'Dib u Dir' : 'Retry'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === 'retry'
                ? (isSo ? 'Dib u dir dalabka?' : 'Resend this order?')
                : (isSo ? 'Calaamadi sida la diray?' : 'Mark as delivered?')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <div><b>{isSo ? 'Helaha:' : 'Receiver:'}</b> {confirmAction?.order.receiver_phone}</div>
                <div><b>{isSo ? 'Xirmada:' : 'Package:'}</b> {confirmAction?.order.package_name}</div>
                <div><b>{isSo ? 'Qiimaha:' : 'Price:'}</b> ${Number(confirmAction?.order.selling_price || 0).toFixed(2)}</div>
                {confirmAction?.kind === 'retry' && (
                  <div className="pt-2 space-y-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                        {isSo ? 'Lambarka helaha (waad bedeli kartaa)' : 'Receiver phone (you can edit)'}
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={retryPhone}
                        onChange={(e) => setRetryPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono outline-none focus:border-orange-500"
                        placeholder="61xxxxxxx"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                        {isSo ? 'Shirkadda' : 'Provider'}
                      </label>
                      <select
                        value={retryProviderId}
                        onChange={(e) => {
                          setRetryProviderId(e.target.value);
                          setRetryCategoryId('');
                          setRetryPackageId('');
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm outline-none"
                      >
                        <option value="">{isSo ? 'Dooro shirkad' : 'Select provider'}</option>
                        {catalogProviders.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.provider_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                        {isSo ? 'Category' : 'Category'}
                      </label>
                      <select
                        value={retryCategoryId}
                        onChange={(e) => {
                          setRetryCategoryId(e.target.value);
                          setRetryPackageId('');
                        }}
                        disabled={!retryProviderId}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm outline-none disabled:opacity-50"
                      >
                        <option value="">{isSo ? 'Dooro category' : 'Select category'}</option>
                        {catalogCategories
                          .filter((cat: any) => cat.provider_id === retryProviderId)
                          .map((cat: any) => (
                            <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                        {isSo ? 'Xirmada' : 'Package'}
                      </label>
                      <select
                        value={retryPackageId}
                        onChange={(e) => setRetryPackageId(e.target.value)}
                        disabled={!retryProviderId || !retryCategoryId}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm outline-none disabled:opacity-50"
                      >
                        <option value="">{isSo ? 'Dooro xirmo' : 'Select package'}</option>
                        {catalogPackages
                          .filter((pkg: any) => pkg.provider_id === retryProviderId && pkg.category_id === retryCategoryId)
                          .map((pkg: any) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.package_name} — ${Number(pkg.selling_price || 0).toFixed(2)}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
                <div className="text-xs text-orange-600 pt-1">
                  {confirmAction?.kind === 'retry'
                    ? (isSo ? 'Isla dalabkan ayaa dib loo dirayaa (orderka cusub ma abuurmayo).' : 'The SAME order will be re-queued (no new order is created).')
                    : (isSo ? 'Dalabka waxaa loo calaamadinayaa sida la dhameystiray.' : 'The order will be marked as delivered.')}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isSo ? 'Maya' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                const { kind, order } = confirmAction;
                setConfirmAction(null);
                if (kind === 'retry') {
                  if (!retryProviderId || !retryCategoryId || !retryPackageId) {
                    toast.error(isSo ? 'Shirkad, category iyo xirmo dooro' : 'Select provider, category and package');
                    return;
                  }
                  retryOrder(order.id, retryPhone, retryPackageId);
                } else markDelivered(order.id);
              }}
            >
              {isSo ? 'Haa, xaqiiji' : 'Yes, confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
