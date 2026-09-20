import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNonFinancialOrder } from '@/lib/profit';
import { startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent,
  ActionBtn, LazyFallback, EmptyState, useOrderActions,
  formatPhone, formatDate, formatTime,
  Package, DollarSign, CheckCircle, XCircle, Clock, Calendar, Phone, Hash, User, CreditCard, RotateCcw, ChevronDown, Code, Pencil, Send,
} from './shared';
import { ArrowLeft } from 'lucide-react';
import { Plus } from 'lucide-react';
import { AddScheduledOrderDialog } from '@/components/admin/AddScheduledOrderDialog';

// ========== ORDER ACCORDION ITEM ==========
const OrderAccordionItem = ({ item, idx, expandedId, setExpandedId, isSo, actions }: {
  item: any; idx: number; expandedId: string | null; setExpandedId: (id: string | null) => void;
  isSo: boolean; actions: ReturnType<typeof useOrderActions>;
}) => {
  const isExpanded = expandedId === item.id;
  const statusColor = item.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : item.delivery_status === 'failed' ? 'bg-red-100 text-red-700' : item.delivery_status === 'pending' ? 'bg-yellow-100 text-yellow-700' : item.status === 'cancelled' ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-600';
  const isCancellable = item.status !== 'cancelled' && item.delivery_status !== 'delivered';
  
  const isMarkable = item.delivery_status === 'pending';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
      <button onClick={() => setExpandedId(isExpanded ? null : item.id)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50 dark:active:bg-purple-950/20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{item.package_name}</div>
            <div className="text-[11px] text-gray-400">{formatPhone(item.receiver_phone)} · {formatTime(item.created_at)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-sm">${Number(item.selling_price).toFixed(2)}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor}`}>{item.delivery_status || item.status}</span>
          {item.payment_source && <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${
            item.payment_source === 'ussd_online' ? 'bg-blue-100 text-blue-700' :
            item.payment_source === 'sms_offline' ? 'bg-orange-100 text-orange-700' :
            item.payment_source === 'auto_topup' ? 'bg-cyan-100 text-cyan-700' :
            item.payment_source === 'manual' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-600'
          }`}>{
            item.payment_source === 'ussd_online' ? 'Online' :
            item.payment_source === 'sms_offline' ? 'Offline' :
            item.payment_source === 'auto_topup' ? 'AutoTop' :
            item.payment_source === 'manual' ? 'Manual' :
            item.payment_source
          }</span>}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isExpanded && (
        <InvoiceAccordionContent
          isSo={isSo} id={item.id} notes={item.delivery_notes}
          rows={[
            { icon: Package, label: isSo ? 'Package' : 'Package', value: item.package_name, color: 'text-purple-500' },
            { icon: Hash, label: 'Data', value: item.data_amount, color: 'text-cyan-500' },
            { icon: Phone, label: isSo ? 'Qaataha' : 'Receiver', value: `+252${formatPhone(item.receiver_phone)}`, color: 'text-green-500' },
            { icon: User, label: isSo ? 'Macmiilka' : 'Customer', value: `+252${formatPhone(item.customer_phone)}`, color: 'text-purple-500' },
            ...(item.sender_phone ? [{ icon: Phone, label: isSo ? 'Diraha' : 'Sender', value: `+252${formatPhone(item.sender_phone)}`, color: 'text-orange-500' }] : []),
            { icon: DollarSign, label: isSo ? 'Iibka' : 'Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
            { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: `$${Number(item.cost_price || 0).toFixed(2)}`, color: 'text-red-500' },
            { icon: Calendar, label: isSo ? 'Taariikhda' : 'Date', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
            ...(item.delivered_at ? [{ icon: CheckCircle, label: isSo ? 'La gaarsiiyay' : 'Delivered', value: `${formatDate(item.delivered_at)} ${formatTime(item.delivered_at)}`, color: 'text-green-600' }] : []),
            ...(item.manual_action_at ? [{ icon: Clock, label: isSo ? (item.manual_action_type === 'cancelled' ? 'Waqtiga kansalka' : 'Waqtiga ansixinta') : (item.manual_action_type === 'cancelled' ? 'Cancelled at' : 'Approved at'), value: `${formatDate(item.manual_action_at)} ${formatTime(item.manual_action_at)}`, color: 'text-rose-500' }] : []),
            ...(item.manual_action_email ? [{ icon: User, label: isSo ? 'Qofka qabtay' : 'Action by', value: item.manual_action_email, color: 'text-amber-600' }] : []),
            ...(item.manual_action_note ? [{ icon: Code, label: isSo ? 'Sababta' : 'Reason', value: item.manual_action_note, color: 'text-orange-500' }] : []),
            ...(item.payment_source ? [{ icon: CreditCard, label: isSo ? 'Nooca' : 'Type', value: 
              item.payment_source === 'ussd_online' ? 'Online' :
              item.payment_source === 'sms_offline' ? 'Offline (SMS)' :
              item.payment_source === 'auto_topup' ? 'Auto Top-Up' :
              item.payment_source === 'manual' ? 'Manual' :
              item.payment_source, color: 'text-indigo-500' }] : []),
          ]}
          actions={
            <>
              <ActionBtn onClick={() => actions.retryDelivery(item.id, item.receiver_phone)} icon={RotateCcw} label={isSo ? 'Dib u Dir' : 'Resend'} variant="warning" />
              {isMarkable && <ActionBtn onClick={() => actions.markDelivered(item.id)} icon={CheckCircle} label={isSo ? 'Dhamee' : 'Deliver'} variant="success" />}
              {isCancellable && <ActionBtn onClick={() => actions.cancelOrder(item.id)} icon={XCircle} label={isSo ? 'Kansal' : 'Cancel'} variant="danger" />}
            </>
          }
        />
      )}
    </div>
  );
};

// ========== DAILY ORDERS ==========
export const DailyOrdersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actions = useOrderActions(setOrders, isSo);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const date = new Date(selectedDate);
      const { data, error } = await supabase.from('orders').select('*')
        .gte('created_at', startOfDay(date).toISOString()).lte('created_at', endOfDay(date).toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = orders.filter(o => {
    if (statusFilter === 'pending') return o.delivery_status === 'pending' && (o.status === 'paid' || o.status === 'completed');
    if (statusFilter === 'delivered') return o.delivery_status === 'delivered';
    if (statusFilter === 'failed') return o.delivery_status === 'failed';
    if (statusFilter === 'cancelled') return o.status === 'cancelled';
    return true;
  }).filter(o => !searchQuery || o.receiver_phone?.includes(searchQuery) || o.customer_phone?.includes(searchQuery) || o.package_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const deliveredCount = orders.filter(o => o.delivery_status === 'delivered').length;
  const pendingCount = orders.filter(o => o.delivery_status === 'pending' && (o.status === 'paid' || o.status === 'completed')).length;
  const failedCount = orders.filter(o => o.delivery_status === 'failed').length;
  const totalRevenue = orders.filter(o => (o.status === 'paid' || o.status === 'completed') && !isNonFinancialOrder(o)).reduce((s, o) => s + Number(o.selling_price || 0), 0);
  const navigateDate = (dir: number) => { const d = new Date(selectedDate); d.setDate(d.getDate() + dir); setSelectedDate(d.toISOString().split('T')[0]); };
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="flex-1 bg-transparent text-sm font-medium outline-none" />
        </div>
        <button onClick={() => navigateDate(1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center rotate-180"><ArrowLeft className="w-4 h-4" /></button>
        {!isToday && <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} className="text-xs px-2 py-1.5 bg-purple-600 text-white rounded-lg font-medium">{isSo ? 'Maanta' : 'Today'}</button>}
      </div>
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: orders.length, icon: Package, color: 'bg-purple-500' },
        { label: isSo ? 'La diray' : 'Delivered', value: deliveredCount, icon: CheckCircle, color: 'bg-green-500' },
        { label: isSo ? 'Sugaya' : 'Pending', value: pendingCount, icon: Clock, color: 'bg-yellow-500' },
        { label: isSo ? 'Guuldaraystay' : 'Failed', value: failedCount, icon: XCircle, color: 'bg-red-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: orders.length },
        { key: 'pending', label: isSo ? 'Sugaya' : 'Pending', count: pendingCount },
        { key: 'delivered', label: isSo ? 'La diray' : 'Delivered', count: deliveredCount },
        { key: 'failed', label: isSo ? 'Guuldaraystay' : 'Failed', count: failedCount },
        { key: 'cancelled', label: isSo ? 'Kanselay' : 'Cancelled', count: orders.filter(o => o.status === 'cancelled').length },
      ]} activeKey={statusFilter} onSelect={setStatusFilter} />
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={isSo ? 'Raadi...' : 'Search...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-2">{filtered.map((item, idx) => <OrderAccordionItem key={item.id} item={item} idx={idx} expandedId={expandedId} setExpandedId={setExpandedId} isSo={isSo} actions={actions} />)}</div>
      )}
      {actions.dialog}
    </div>
  );
};

// ========== GENERIC ORDER LIST ==========
export const OrdersListView = ({ isSo, type }: { isSo: boolean; type: string }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actions = useOrderActions(setOrders, isSo);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    switch (type) {
      case 'sales': query = query.gte('created_at', today.toISOString()).in('status', ['paid', 'completed']); break;
      case 'failed': query = query.eq('delivery_status', 'failed'); break;
      case 'pending': query = query.eq('delivery_status', 'pending').in('status', ['paid', 'completed']); break;
      case 'delivered': query = query.eq('delivery_status', 'delivered'); break;
    }
    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  }, [type]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = search ? orders.filter(o => o.receiver_phone?.includes(search) || o.customer_phone?.includes(search) || o.package_name?.toLowerCase().includes(search.toLowerCase())) : orders;
  const totalRev = orders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
  const deliveredC = orders.filter(o => o.delivery_status === 'delivered').length;
  const failedC = orders.filter(o => o.delivery_status === 'failed').length;

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: orders.length, icon: Package, color: 'bg-purple-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${totalRev.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
        { label: isSo ? 'Guulaystay' : 'Delivered', value: deliveredC, icon: CheckCircle, color: 'bg-green-500' },
        { label: isSo ? 'Guuldaraystay' : 'Failed', value: failedC, icon: XCircle, color: 'bg-red-500' },
      ]} />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka ama package...' : 'Search phone or package...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-2">{filtered.map((item, idx) => <OrderAccordionItem key={item.id} item={item} idx={idx} expandedId={expandedId} setExpandedId={setExpandedId} isSo={isSo} actions={actions} />)}</div>
      )}
      {actions.dialog}
    </div>
  );
};

// ========== AUTO TOP-UP (moved to AutoTopUpView.tsx) ==========
export { AutoTopUpCustomView } from './AutoTopUpView';

// ========== SCHEDULED ORDERS ==========
export const ScheduledOrdersView = ({ isSo }: { isSo: boolean }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const actions = useOrderActions(setOrders, isSo);


  const loadOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .not('scheduled_for', 'is', null)
      .order('scheduled_for', { ascending: true })
      .limit(300);
    setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const now = new Date();
  const upcoming = orders.filter(o => o.scheduled_for && new Date(o.scheduled_for) > now && o.delivery_status !== 'delivered' && o.status !== 'cancelled');
  const past = orders.filter(o => o.scheduled_for && new Date(o.scheduled_for) <= now && o.delivery_status !== 'delivered' && o.status !== 'cancelled');
  const delivered = orders.filter(o => o.delivery_status === 'delivered');
  const cancelled = orders.filter(o => o.status === 'cancelled');

  const bucket =
    statusFilter === 'upcoming' ? upcoming :
    statusFilter === 'past' ? past :
    statusFilter === 'delivered' ? delivered :
    statusFilter === 'cancelled' ? cancelled :
    orders;

  const filtered = search
    ? bucket.filter(o => o.receiver_phone?.includes(search) || o.customer_phone?.includes(search) || o.package_name?.toLowerCase().includes(search.toLowerCase()))
    : bucket;

  const totalRev = orders.reduce((s, o) => s + Number(o.selling_price || 0), 0);

  const runNow = async (id: string) => {
    const { error } = await supabase.from('orders').update({ scheduled_for: null }).eq('id', id);
    if (error) { toast.error(isSo ? 'Khalad' : 'Failed'); return; }
    toast.success(isSo ? 'Waa la bilaabay' : 'Triggered');
    loadOrders();
  };

  const resend = async (id: string) => {
    const { error } = await supabase.from('orders')
      .update({ scheduled_for: null, status: 'paid', delivery_status: 'pending', delivered_at: null })
      .eq('id', id);
    if (error) { toast.error(isSo ? 'Khalad' : 'Failed'); return; }
    toast.success(isSo ? 'Dib ayaa loo diray' : 'Resent');
    loadOrders();
  };

  const openEdit = (item: any) => {
    const d = item.scheduled_for ? new Date(item.scheduled_for) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditing({
      id: item.id,
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const when = new Date(editing.value);
    if (isNaN(when.getTime())) { toast.error(isSo ? 'Taariikh khaldan' : 'Invalid date'); return; }
    setSavingEdit(true);
    const { error } = await supabase.from('orders')
      .update({ scheduled_for: when.toISOString() })
      .eq('id', editing.id);
    setSavingEdit(false);
    if (error) { toast.error(isSo ? 'Khalad' : 'Failed'); return; }
    toast.success(isSo ? 'Waqtiga waa la beddelay' : 'Schedule updated');
    setEditing(null);
    loadOrders();
  };



  return (
    <div className="space-y-3">
      <button
        onClick={() => setAddOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-2.5 rounded-xl shadow-sm active:opacity-90"
      >
        <Plus className="w-4 h-4" />
        {isSo ? 'Qorshee Dalab Cusub' : 'Schedule New Order'}
      </button>
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: orders.length, icon: Calendar, color: 'bg-indigo-500' },
        { label: isSo ? 'Sugaya' : 'Upcoming', value: upcoming.length, icon: Clock, color: 'bg-blue-500' },
        { label: isSo ? 'Dib u dhacay' : 'Past due', value: past.length, icon: XCircle, color: 'bg-orange-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${totalRev.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
      ]} />
      <FilterRow filters={[
        { key: 'upcoming', label: isSo ? 'Sugaya' : 'Upcoming', count: upcoming.length },
        { key: 'past', label: isSo ? 'Dib u dhacay' : 'Past due', count: past.length },
        { key: 'delivered', label: isSo ? 'La diray' : 'Delivered', count: delivered.length },
        { key: 'cancelled', label: isSo ? 'Kanselay' : 'Cancelled', count: cancelled.length },
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: orders.length },
      ]} activeKey={statusFilter} onSelect={setStatusFilter} />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambar ama package...' : 'Search phone or package...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No scheduled orders'} /> : (
        <div className="space-y-2">
          {filtered.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const when = item.scheduled_for ? new Date(item.scheduled_for) : null;
            const isPast = when && when <= now;
            const isCancellable = item.status !== 'cancelled' && item.delivery_status !== 'delivered';
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-indigo-100/50 dark:border-indigo-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-indigo-50/50 dark:active:bg-indigo-950/20">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-indigo-400 w-5">#{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{item.package_name}</div>
                      <div className="text-[11px] text-gray-400">{formatPhone(item.receiver_phone)} · {when ? `${formatDate(when.toISOString())} ${formatTime(when.toISOString())}` : '-'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-sm">${Number(item.selling_price).toFixed(2)}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isPast ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isPast ? (isSo ? 'Dib u dhacay' : 'Past due') : (isSo ? 'Sugaya' : 'Upcoming')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent
                    isSo={isSo} id={item.id} notes={item.delivery_notes}
                    rows={[
                      { icon: Calendar, label: isSo ? 'Waqtiga la qorsheeyay' : 'Scheduled for', value: when ? `${formatDate(when.toISOString())} ${formatTime(when.toISOString())}` : '-', color: 'text-indigo-500' },
                      { icon: Package, label: 'Package', value: item.package_name, color: 'text-purple-500' },
                      { icon: Phone, label: isSo ? 'Qaataha' : 'Receiver', value: `+252${formatPhone(item.receiver_phone)}`, color: 'text-green-500' },
                      { icon: User, label: isSo ? 'Macmiilka' : 'Customer', value: `+252${formatPhone(item.customer_phone)}`, color: 'text-purple-500' },
                      { icon: DollarSign, label: isSo ? 'Iibka' : 'Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
                      { icon: Calendar, label: isSo ? 'La sameeyay' : 'Created', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                      ...(item.manual_action_at ? [{ icon: Clock, label: isSo ? 'Waqtiga tallaabada' : 'Action at', value: `${formatDate(item.manual_action_at)} ${formatTime(item.manual_action_at)}`, color: 'text-rose-500' }] : []),
                      ...(item.manual_action_email ? [{ icon: User, label: isSo ? 'Qofka qabtay' : 'Action by', value: item.manual_action_email, color: 'text-amber-600' }] : []),
                      ...(item.manual_action_note ? [{ icon: Code, label: isSo ? 'Sababta' : 'Reason', value: item.manual_action_note, color: 'text-orange-500' }] : []),
                    ]}
                    actions={
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionBtn onClick={() => openEdit(item)} icon={Pencil} label={isSo ? 'Beddel waqtiga' : 'Edit time'} />
                        {isCancellable && <ActionBtn onClick={() => runNow(item.id)} icon={RotateCcw} label={isSo ? 'Hadda dir' : 'Send now'} variant="success" />}
                        <ActionBtn onClick={() => resend(item.id)} icon={Send} label={isSo ? 'Dib u dir' : 'Resend'} variant="warning" />
                        {isCancellable && <ActionBtn onClick={() => actions.cancelOrder(item.id)} icon={XCircle} label={isSo ? 'Kansal' : 'Cancel'} variant="danger" />}
                      </div>
                    }

                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <AddScheduledOrderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={loadOrders}
        isSo={isSo}
      />
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => !savingEdit && setEditing(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm text-gray-800 dark:text-white">
              {isSo ? 'Beddel taariikhda & saacadda' : 'Edit date & time'}
            </div>
            <input
              type="datetime-local"
              value={editing.value}
              onChange={e => setEditing({ ...editing, value: e.target.value })}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <button disabled={savingEdit} onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {isSo ? 'Jooji' : 'Cancel'}
              </button>
              <button disabled={savingEdit} onClick={saveEdit}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-60">
                {savingEdit ? '...' : (isSo ? 'Keydi' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {actions.dialog}

    </div>
  );
};
