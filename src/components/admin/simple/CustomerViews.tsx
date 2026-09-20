import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent,
  ActionBtn, LazyFallback, EmptyState, formatPhone, formatDate, formatTime, normalizePhone,
  Users, UserPlus, Phone, Calendar, DollarSign, CheckCircle, XCircle, Package, ChevronDown, Power, Trash2, Globe, Ban, Plus,
  Smartphone,
} from './shared';
import { formatTimeAgo } from './shared';
import { Edit, Square, CheckSquare } from 'lucide-react';
import { EditDeviceDialog } from '../EditDeviceDialog';
import { DeleteDeviceDialog } from '../DeleteDeviceDialog';

// ========== CUSTOMERS ==========
export const CustomersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [phones, setPhones] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);

  const PAGE_SIZE = 100;
  const FETCH_BATCH_SIZE = 1000;

  const fetchAllRows = async (
    table: 'verified_phones' | 'orders',
    columns: string,
    orderColumn = 'created_at',
  ) => {
    const rows: any[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .order(orderColumn, { ascending: false })
        .range(from, from + FETCH_BATCH_SIZE - 1);

      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < FETCH_BATCH_SIZE) break;
      from += FETCH_BATCH_SIZE;
    }

    return rows;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allPhones, allOrders] = await Promise.all([
        fetchAllRows('verified_phones', '*'),
        fetchAllRows('orders', 'customer_phone, created_at, selling_price'),
      ]);
      setPhones(allPhones);
      setOrders(allOrders);
    } catch (error: any) {
      console.error('Customers load error:', error);
      toast.error(isSo ? 'Macaamiisha lama soo qaadi karin' : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [isSo]);

  useEffect(() => { loadData(); }, [loadData]);
  useRealtimeRefresh(['verified_phones', 'orders'], loadData, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const allBuyerPhones = new Set(orders.map(o => normalizePhone(o.customer_phone)));
  const todayRegistered = phones.filter(p => new Date(p.created_at) >= startOfToday);
  const activeCustomers = phones.filter(p => allBuyerPhones.has(normalizePhone(p.phone_number)));
  const inactiveCustomers = phones.filter(p => !allBuyerPhones.has(normalizePhone(p.phone_number)));
  const purchasedToday = phones.filter(p => {
    const todayOrders = orders.filter(o => new Date(o.created_at) >= startOfToday);
    return new Set(todayOrders.map(o => normalizePhone(o.customer_phone))).has(normalizePhone(p.phone_number));
  });

  const getFiltered = () => {
    let filtered = phones;
    if (filter === 'today') filtered = todayRegistered;
    else if (filter === 'active') filtered = activeCustomers;
    else if (filter === 'inactive') filtered = inactiveCustomers;
    else if (filter === 'purchasedToday') filtered = purchasedToday;
    if (search) filtered = filtered.filter(p => p.phone_number.includes(search));
    return filtered;
  };

  const filteredCustomers = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageCustomers = filteredCustomers.slice(pageStart, pageStart + PAGE_SIZE);
  const selectedCustomers = phones.filter(c => selectedIds.has(c.id));
  const allInViewSelected = pageCustomers.length > 0 && pageCustomers.every(c => selectedIds.has(c.id));

  useEffect(() => {
    setCurrentPage(0);
    setExpandedId(null);
  }, [filter, search]);

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInView = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allInViewSelected) {
        pageCustomers.forEach(c => next.delete(c.id));
      } else {
        pageCustomers.forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const selectAllInactive = () => {
    setFilter('inactive');
    setSelectedIds(new Set(inactiveCustomers.map(c => c.id)));
  };

  const deleteCustomer = async (id: string, phone: string) => {
    if (!confirm(isSo ? `Ma hubtaa inaad tirtirto ${phone}?` : `Delete ${phone}?`)) return;
    const { error } = await supabase.from('verified_phones').delete().eq('id', id);
    if (error) { toast.error('Error'); return; }
    setPhones(prev => prev.filter(p => p.id !== id));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const bulkDelete = async () => {
    const ids = selectedCustomers.map(c => c.id);
    if (ids.length === 0) return;
    const msg = isSo
      ? `Ma hubtaa inaad tirtirto ${ids.length} macaamiil?`
      : `Delete ${ids.length} customers?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from('verified_phones').delete().in('id', ids);
    if (error) { toast.error(isSo ? 'Khalad ayaa dhacay' : 'Error'); return; }
    setPhones(prev => prev.filter(p => !ids.includes(p.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    toast.success(isSo ? `Waa la tirtiray ${ids.length} macaamiil` : `Deleted ${ids.length} customers`);
  };

  const editCustomer = async (item: any) => {
    const input = window.prompt(isSo ? 'Geli lambarka cusub:' : 'Enter new phone number:', item.phone_number);
    if (input === null) return;
    const newPhone = normalizePhone(input);
    if (!newPhone || newPhone === item.phone_number) return;
    if (!/^\d{9,12}$/.test(newPhone)) { toast.error(isSo ? 'Lambarka sax ma aha' : 'Invalid phone number'); return; }
    const { error } = await supabase.from('verified_phones').update({ phone_number: newPhone }).eq('id', item.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    setPhones(prev => prev.map(p => p.id === item.id ? { ...p, phone_number: newPhone } : p));
    toast.success(isSo ? 'Lambarka waa la beddelay' : 'Phone updated');
  };

  const getCustomerStats = (phone: string) => {
    const norm = normalizePhone(phone);
    const customerOrders = orders.filter(o => normalizePhone(o.customer_phone) === norm);
    const totalSpent = customerOrders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
    return { orderCount: customerOrders.length, totalSpent };
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: phones.length, color: 'bg-purple-500', icon: Users },
        { label: isSo ? 'Cusub Maanta' : 'New Today', value: todayRegistered.length, color: 'bg-green-500', icon: UserPlus },
        { label: isSo ? 'Maanta libsatay' : 'Bought Today', value: purchasedToday.length, color: 'bg-blue-500', icon: Package },
        { label: isSo ? 'Aan libsan' : 'Never Bought', value: inactiveCustomers.length, color: 'bg-orange-500', icon: XCircle },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: phones.length },
        { key: 'today', label: isSo ? 'Cusub' : 'New', count: todayRegistered.length },
        { key: 'active', label: isSo ? 'Firfircoon' : 'Active', count: activeCustomers.length },
        { key: 'purchasedToday', label: isSo ? 'Maanta' : 'Today', count: purchasedToday.length },
        { key: 'inactive', label: isSo ? 'Aan Iibsan' : 'Inactive', count: inactiveCustomers.length },
      ]} activeKey={filter} onSelect={(key) => { setFilter(key); setSelectedIds(new Set()); setCurrentPage(0); }} activeColor="bg-teal-500" />
      <SearchInput value={search} onChange={(v) => { setSearch(v); setSelectedIds(new Set()); setCurrentPage(0); }} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />

      <button
        onClick={selectAllInactive}
        className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        <CheckSquare className="w-4 h-4" />
        {isSo ? 'Dooro dhammaan aan wax iib ah sameyn' : 'Select all customers who never bought'}
      </button>

      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl px-3 py-2">
          <span className="text-sm font-semibold text-red-700 dark:text-red-200">
            {selectedIds.size} {isSo ? 'la dooranay' : 'selected'}
          </span>
          <button
            onClick={bulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg active:bg-red-700"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isSo ? 'Tirtir' : 'Delete'}
          </button>
        </div>
      )}

      {loading ? <LazyFallback /> : filteredCustomers.length === 0 ? <EmptyState message={isSo ? 'Wax macaamiil ah lama helin' : 'No customers found'} /> : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={toggleSelectAllInView}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200"
            >
              {allInViewSelected ? <CheckSquare className="w-4 h-4 text-teal-600" /> : <Square className="w-4 h-4 text-gray-400" />}
              {isSo ? 'Dooro dhammaan kuwa la filayo' : 'Select all visible'}
            </button>
          </div>
          {pageCustomers.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const hasOrders = allBuyerPhones.has(normalizePhone(item.phone_number));
            const isNewToday = new Date(item.created_at) >= startOfToday;
            const stats = isExpanded ? getCustomerStats(item.phone_number) : null;
            const isSelected = selectedIds.has(item.id);
            return (
              <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden ${isSelected ? 'border-teal-400 ring-1 ring-teal-400/30' : 'border-purple-100/50 dark:border-purple-900/20'}`}>
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }}
                      className="shrink-0 w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 flex items-center justify-center active:bg-gray-100 dark:active:bg-gray-700"
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-teal-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">+252{formatPhone(item.phone_number)}</div>
                      <div className="text-[11px] text-gray-400">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isNewToday && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{isSo ? 'Cusub' : 'New'}</span>}
                    {hasOrders ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{isSo ? 'Active' : 'Active'}</span> : <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">Inactive</span>}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: Phone, label: isSo ? 'Lambarka' : 'Phone', value: `+252${item.phone_number}`, color: 'text-purple-500' },
                    { icon: Calendar, label: isSo ? 'Diiwaangelintu' : 'Registered', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                    ...(item.last_login_at ? [{ icon: Calendar, label: isSo ? 'Gelitiin Danbe' : 'Last Login', value: `${formatDate(item.last_login_at)} ${formatTime(item.last_login_at)}`, color: 'text-blue-500' }] : []),
                    ...(stats ? [
                      { icon: Package, label: isSo ? 'Dalabyada' : 'Orders', value: `${stats.orderCount}`, color: 'text-cyan-500' },
                      { icon: DollarSign, label: isSo ? 'Ku bixiyay' : 'Total Spent', value: `$${stats.totalSpent.toFixed(2)}`, color: 'text-emerald-500' },
                    ] : []),
                  ]} actions={
                    <>
                      <ActionBtn onClick={() => editCustomer(item)} icon={Edit} label={isSo ? 'Beddel' : 'Edit'} variant="warning" />
                      <ActionBtn onClick={() => deleteCustomer(item.id, item.phone_number)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
                    </>
                  } />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredCustomers.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
          <button
            onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); setExpandedId(null); }}
            disabled={safePage === 0}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← {isSo ? 'Previous' : 'Previous'}
          </button>

          <div className="text-center min-w-0">
            <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
              {isSo ? 'Bogga' : 'Page'} {safePage + 1} / {totalPages}
            </div>
            <div className="text-[10px] text-gray-400">
              {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredCustomers.length)} / {filteredCustomers.length}
            </div>
          </div>

          <button
            onClick={() => { setCurrentPage(p => Math.min(totalPages - 1, p + 1)); setExpandedId(null); }}
            disabled={safePage >= totalPages - 1}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-teal-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSo ? 'Next' : 'Next'} →
          </button>
        </div>
      )}
    </div>
  );
};

// ========== OFFLINE REGISTRATIONS ==========
export const OfflineRegistrationsCustomView = ({ isSo }: { isSo: boolean }) => {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newReg, setNewReg] = useState({ sender_phone: '', receiver_phone: '', provider_id: '' });
  const [providerOptions, setProviderOptions] = useState<Array<{ id: string; provider_name: string }>>([]);

  useEffect(() => {
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => setProviderOptions(data || []));
  }, []);


  const loadRegs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('offline_registrations').select('*').order('created_at', { ascending: false });
    setRegs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRegs(); }, [loadRegs]);
  useRealtimeRefresh(['offline_registrations'], loadRegs, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const activeRegs = regs.filter(r => r.is_active).length;
  const inactiveRegs = regs.filter(r => !r.is_active).length;
  const todayRegs = regs.filter(r => new Date(r.created_at) >= startOfToday).length;

  const getFiltered = () => {
    let filtered = regs;
    if (filter === 'active') filtered = filtered.filter(r => r.is_active);
    else if (filter === 'inactive') filtered = filtered.filter(r => !r.is_active);
    else if (filter === 'today') filtered = filtered.filter(r => new Date(r.created_at) >= startOfToday);
    if (search) filtered = filtered.filter(r => r.sender_phone?.includes(search) || r.receiver_phone?.includes(search));
    return filtered;
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    await supabase.from('offline_registrations').update({ is_active: !currentStatus }).eq('id', id);
    setRegs(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Status updated');
  };

  const deleteReg = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto?' : 'Delete this registration?')) return;
    await supabase.from('offline_registrations').delete().eq('id', id);
    setRegs(prev => prev.filter(r => r.id !== id));
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const addReg = async () => {
    if (!newReg.sender_phone || !newReg.receiver_phone) { toast.error(isSo ? 'Buuxi meelaha' : 'Fill required fields'); return; }
    const chosen = providerOptions.find(p => p.id === newReg.provider_id);
    const { data, error } = await supabase.from('offline_registrations').insert({
      sender_phone: newReg.sender_phone,
      receiver_phone: newReg.receiver_phone,
      provider_id: chosen?.id ?? null,
      provider_name: chosen?.provider_name ?? null,
    } as any).select().single();
    if (error) { toast.error('Error: ' + error.message); return; }
    setRegs(prev => [data, ...prev]);
    setNewReg({ sender_phone: '', receiver_phone: '', provider_id: '' });
    setShowAdd(false);
    toast.success(isSo ? 'Waa lagu daray' : 'Added');
  };


  const filteredRegs = getFiltered();

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: regs.length, color: 'bg-purple-500', icon: Users },
        { label: 'Active', value: activeRegs, color: 'bg-green-500', icon: CheckCircle },
        { label: 'Inactive', value: inactiveRegs, color: 'bg-amber-500', icon: XCircle },
        { label: isSo ? 'Maanta' : 'Today', value: todayRegs, color: 'bg-sky-500', icon: UserPlus },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: regs.length },
        { key: 'active', label: 'Active', count: activeRegs },
        { key: 'inactive', label: 'Inactive', count: inactiveRegs },
        { key: 'today', label: isSo ? 'Maanta' : 'Today', count: todayRegs },
      ]} activeKey={filter} onSelect={setFilter} activeColor="bg-orange-500" />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi sender ama receiver...' : 'Search...'} />
      <button onClick={() => setShowAdd(!showAdd)} className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Diiwaangelin Cusub' : 'Add New Registration'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <input value={newReg.sender_phone} onChange={e => setNewReg(p => ({...p, sender_phone: e.target.value}))} placeholder={isSo ? 'Lambarka Diraha' : 'Sender Phone'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <input value={newReg.receiver_phone} onChange={e => setNewReg(p => ({...p, receiver_phone: e.target.value}))} placeholder={isSo ? 'Lambarka Qaataha' : 'Receiver Phone'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <select value={newReg.provider_id} onChange={e => setNewReg(p => ({...p, provider_id: e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">{isSo ? '— Dooro Shirkadda —' : '— Select Provider —'}</option>
            {providerOptions.map(p => (
              <option key={p.id} value={p.id}>{p.provider_name}</option>
            ))}
          </select>
          <button onClick={addReg} className="w-full py-2 bg-green-500 text-white rounded-lg text-sm font-medium active:bg-green-600">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> {isSo ? 'Ku Dar' : 'Add'}
          </button>
        </div>
      )}
      {loading ? <LazyFallback /> : filteredRegs.length === 0 ? <EmptyState message={isSo ? 'Wax lama helin' : 'No registrations found'} /> : (
        <div className="space-y-2">
          {filteredRegs.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">{formatPhone(item.sender_phone)}</div>
                      <div className="text-[11px] text-gray-400">→ {formatPhone(item.receiver_phone)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: Phone, label: 'Sender', value: `+252${item.sender_phone}`, color: 'text-purple-500' },
                    { icon: Phone, label: 'Receiver', value: `+252${item.receiver_phone}`, color: 'text-green-500' },
                    { icon: Globe, label: 'Provider', value: item.provider_name || '—', color: 'text-blue-500' },
                    { icon: Calendar, label: isSo ? 'Taariikhda' : 'Date', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                    { icon: Power, label: 'Status', value: item.is_active ? 'Active' : 'Inactive', color: item.is_active ? 'text-green-500' : 'text-red-500' },
                  ]} actions={
                    <>
                      <ActionBtn onClick={() => toggleStatus(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
                      <ActionBtn onClick={() => deleteReg(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
                    </>
                  } />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ========== DEVICES ==========
export const DevicesCustomView = ({ isSo }: { isSo: boolean }) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<any>(null);
  const [deleteDevice, setDeleteDevice] = useState<any>(null);
  const [savingSimId, setSavingSimId] = useState<string | null>(null);

  const [paidSims, setPaidSims] = useState<Record<string, number>>({});
  const [payFilter, setPayFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [archived, setArchived] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const last9 = (s: any) => String(s || '').replace(/\D/g, '').slice(-9);

  const loadDevices = useCallback(async () => {
    const [devRes, balRes, provRes, recRes, arcRes] = await Promise.all([
      supabase.from('android_devices').select('*').is('archived_at', null).order('last_ping_at', { ascending: false }),
      supabase.from('sim_balances').select('*'),
      supabase.from('providers_config').select('provider_name').eq('is_active', true).order('display_order'),
      supabase.from('payment_receipts').select('receiver_sim').not('receiver_sim', 'is', null).order('created_at', { ascending: false }).limit(1000),
      supabase.from('android_devices').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(30),
    ]);
    setDevices(devRes.data || []);
    setArchived(arcRes.data || []);
    setBalances(balRes.data || []);
    const counts: Record<string, number> = {};
    (recRes.data || []).forEach((r: any) => {
      const k = last9(r.receiver_sim);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    setPaidSims(counts);
    const names = (provRes.data || []).map((p: any) => p.provider_name).filter(Boolean);
    setProviders(names.length ? names : ['Hormuud', 'Somnet', 'Somtel', 'Amtel', 'Somlink']);
    setLoading(false);
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  useRealtimeRefresh(['android_devices', 'sim_balances'], loadDevices, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const OFFLINE_THRESHOLD = 5 * 60 * 1000;
  const onlineDevices = devices.filter(d => d.last_ping_at && (Date.now() - new Date(d.last_ping_at).getTime()) < OFFLINE_THRESHOLD);
  const offlineDevices = devices.filter(d => !d.last_ping_at || (Date.now() - new Date(d.last_ping_at).getTime()) >= OFFLINE_THRESHOLD);

  const paidCount = (d: any) => (paidSims[last9(d.sim_number)] || 0) + (paidSims[last9(d.sim2_number)] || 0);
  const visibleDevices = devices.filter(d => payFilter === 'all' ? true : payFilter === 'paid' ? paidCount(d) > 0 : paidCount(d) === 0);
  const paidDevices = devices.filter(d => paidCount(d) > 0);


  const restoreDevice = async (item: any) => {
    setRestoringId(item.id);
    try {
      const { error } = await supabase
        .from('android_devices')
        .update({ archived_at: null, is_active: true })
        .eq('id', item.id);
      if (error) throw error;
      setArchived(prev => prev.filter(d => d.id !== item.id));
      await loadDevices();
      toast.success(isSo ? 'Device-ka waa la soo celiyay' : 'Device restored');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setRestoringId(null);
    }
  };

  const toggleDevice = async (id: string, currentStatus: boolean) => {
    await supabase.from('android_devices').update({ is_active: !currentStatus }).eq('id', id);
    setDevices(prev => prev.map(d => d.id === id ? { ...d, is_active: !d.is_active } : d));
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
  };

  // SIM kasta: shirkad, lambarka safka (priority), iyo fur/xidh dirista
  const updateSim = async (item: any, slot: 1 | 2, patch: Record<string, any>) => {
    setSavingSimId(`${item.id}-${slot}`);
    try {
      const { error } = await supabase.from('android_devices').update(patch as any).eq('id', item.id);
      if (error) throw error;
      setDevices(prev => prev.map(d => d.id === item.id ? { ...d, ...patch } : d));
      toast.success(isSo ? 'Waa la kaydiyay' : 'Saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setSavingSimId(null);
    }
  };


  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: devices.length, icon: Smartphone, color: 'bg-purple-500' },
        { label: 'Online', value: onlineDevices.length, icon: CheckCircle, color: 'bg-green-500' },
        { label: 'Offline', value: offlineDevices.length, icon: XCircle, color: 'bg-red-500' },
      ]} />
      {/* Device-yada la tirtiray (archived) - soo celi */}
      {archived.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-xs font-bold text-amber-800 dark:text-amber-200">
              {isSo ? `La tirtiray (${archived.length}) — soo celi` : `Archived (${archived.length}) — restore`}
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-700 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archived.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{item.device_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {item.sim_number || '—'} · {item.device_id}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreDevice(item)}
                    disabled={restoringId === item.id}
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold disabled:opacity-60"
                  >
                    {restoringId === item.id ? '...' : (isSo ? 'Soo celi' : 'Restore')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Kala saarista SIM-yada lacag qabtay iyo kuwa aan qaban */}
      <div className="flex gap-2">
        {([
          ['all', isSo ? `Dhammaan (${devices.length})` : `All (${devices.length})`],
          ['paid', isSo ? `Lacag qabtay (${paidDevices.length})` : `Received payments (${paidDevices.length})`],
          ['unpaid', isSo ? `Lacag ma qaban (${devices.length - paidDevices.length})` : `No payments (${devices.length - paidDevices.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPayFilter(key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${payFilter === key ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? <LazyFallback /> : visibleDevices.length === 0 ? <EmptyState message={isSo ? 'Wax aalad ah lama helin' : 'No devices found'} /> : (
        <div className="space-y-2">
          {visibleDevices.map((item) => {

            const isOnline = item.last_ping_at && (Date.now() - new Date(item.last_ping_at).getTime()) < OFFLINE_THRESHOLD;
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className={`rounded-xl overflow-hidden shadow-sm ${isOnline ? 'bg-green-500' : 'bg-red-400'} text-white`}>
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full p-3 flex items-center gap-3 text-left">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isOnline ? 'bg-green-600' : 'bg-red-500'}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5 flex-wrap">
                      {item.device_name}
                      {[1, 2].map((slot) => {
                        const prov = slot === 1 ? (item.sim1_provider || item.provider_name) : item.sim2_provider;
                        if (!prov) return null;
                        const en = (slot === 1 ? item.sim1_enabled : item.sim2_enabled) ?? true;
                        const prio = (slot === 1 ? item.sim1_priority : item.sim2_priority) ?? 1;
                        return (
                          <span key={slot} className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${en ? 'bg-white/90 text-gray-800' : 'bg-yellow-300 text-yellow-900'}`}>
                            SIM{slot} {prov} · P{prio}{en ? '' : ` · ${isSo ? 'Aqris' : 'Read only'}`}
                          </span>
                        );
                      })}

                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${paidCount(item) > 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-white/30 text-white'}`}>
                        {paidCount(item) > 0
                          ? (isSo ? `Lacag qabtay (${paidCount(item)})` : `Paid (${paidCount(item)})`)
                          : (isSo ? 'Lacag ma qaban' : 'No payments')}
                      </span>
                    </div>

                    <div className="text-xs opacity-80">{isOnline ? 'ONLINE' : 'OFFLINE'} · {formatTimeAgo(item.last_ping_at)}</div>
                  </div>
                  <ChevronDown className={`w-4 h-4 opacity-70 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className={`${isOnline ? 'bg-green-600' : 'bg-red-500'} px-3 pb-3 pt-1 space-y-2 animate-in slide-in-from-top-1 duration-150`}>
                    {/* SIM Balances */}
                    {(() => {
                      const devBalances = balances.filter(b => b.device_id === item.id);
                      const sim1Balances = devBalances.filter(b => b.sim_slot === 1);
                      const sim2Balances = devBalances.filter(b => b.sim_slot === 2);
                      const renderBal = (bals: any[], simLabel: string, provider: string) => {
                        if (bals.length === 0) return null;
                        const evc = bals.find(b => b.balance_type === 'evc_plus');
                        const evoucher = bals.find(b => b.balance_type === 'evoucher');
                        return (
                          <div className="bg-white/10 rounded-lg p-2">
                            <div className="text-[10px] opacity-70 font-bold mb-1">{simLabel} ({provider})</div>
                            <div className="flex gap-3 text-xs">
                              {evc && <div>EVC+: <span className="font-bold">${evc.balance?.toFixed(2)}</span></div>}
                              {evoucher && <div>E-Voucher: <span className="font-bold">${evoucher.balance?.toFixed(2)}</span></div>}
                              {!evc && !evoucher && <div className="opacity-50">—</div>}
                            </div>
                            {(evc || evoucher) && <div className="text-[9px] opacity-50 mt-0.5">{formatTimeAgo((evc || evoucher).last_updated)}</div>}
                          </div>
                        );
                      };
                      return (
                        <div className="space-y-1">
                          {renderBal(sim1Balances, 'SIM 1', item.sim1_provider || item.provider_name || '—')}
                          {renderBal(sim2Balances, 'SIM 2', item.sim2_provider || '—')}
                          {sim1Balances.length === 0 && sim2Balances.length === 0 && (
                            <div className="bg-white/10 rounded-lg p-2 text-xs opacity-50">{isSo ? 'Balance lama helin' : 'No balance data'}</div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-[10px] opacity-70">SIM 1 ({item.sim1_provider || item.provider_name})</span><div className="font-medium">{item.sim_number}</div></div>
                      {item.sim2_number && <div><span className="text-[10px] opacity-70">SIM 2 ({item.sim2_provider || '—'})</span><div className="font-medium">{item.sim2_number}</div></div>}
                      {item.battery_level != null && <div><span className="text-[10px] opacity-70">Battery</span><div className="font-medium">🔋 {item.battery_level}% {item.is_charging ? '⚡' : ''}</div></div>}
                      <div><span className="text-[10px] opacity-70">Deliveries</span><div className="font-medium">{item.total_deliveries || 0} ✓ / {item.failed_deliveries || 0} ✗</div></div>
                      <div><span className="text-[10px] opacity-70">Last Ping</span><div className="font-medium">{item.last_ping_at ? `${formatDate(item.last_ping_at)} ${formatTime(item.last_ping_at)}` : 'Never'}</div></div>
                    </div>
                    {/* Per-SIM: shirkad, priority, fur/xidh */}
                    {([1, 2] as const).map((slot) => {
                      const provKey = slot === 1 ? 'sim1_provider' : 'sim2_provider';
                      const prioKey = slot === 1 ? 'sim1_priority' : 'sim2_priority';
                      const enKey = slot === 1 ? 'sim1_enabled' : 'sim2_enabled';
                      const number = slot === 1 ? item.sim_number : item.sim2_number;
                      if (slot === 2 && !number && !item.sim2_provider) return null;
                      const enabled = item[enKey] ?? true;
                      const provider = item[provKey] || (slot === 1 ? item.provider_name : '') || '';
                      return (
                        <div key={slot} className="bg-white/10 rounded-lg p-2 space-y-1.5">
                          <div className="text-[11px] font-bold">
                            SIM {slot} {number ? `· ${number}` : ''}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[9px] opacity-70 mb-0.5">{isSo ? 'Shirkadda' : 'Provider'}</div>
                              <select
                                value={provider}
                                disabled={savingSimId === `${item.id}-${slot}`}
                                onChange={(e) => updateSim(item, slot, { [provKey]: e.target.value || null })}
                                className="w-full text-xs rounded-md px-2 py-1.5 bg-white text-gray-800 font-medium"
                              >
                                <option value="">{isSo ? '— Midna —' : '— None —'}</option>
                                {providers.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="text-[9px] opacity-70 mb-0.5">{isSo ? 'Lambarka Safka' : 'Priority'}</div>
                              <select
                                value={String(item[prioKey] ?? 1)}
                                disabled={savingSimId === `${item.id}-${slot}`}
                                onChange={(e) => updateSim(item, slot, { [prioKey]: Number(e.target.value) })}
                                className="w-full text-xs rounded-md px-2 py-1.5 bg-white text-gray-800 font-medium"
                              >
                                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[9px] opacity-70">
                              {enabled
                                ? (isSo ? 'Wuu diri karaa dalabyo & fariimo' : 'Can send orders & messages')
                                : (isSo ? 'Kaliya wuu aqrinayaa — waxba ma dirayo' : 'Read-only — sends nothing')}
                            </div>
                            <button
                              onClick={() => updateSim(item, slot, { [enKey]: !enabled })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${enabled ? 'bg-white text-green-700' : 'bg-yellow-300 text-yellow-900'}`}
                            >
                              {enabled
                                ? (isSo ? 'Jooji Dirista' : 'Disable')
                                : (isSo ? 'Ogolow Dirista' : 'Enable')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[9px] opacity-60 px-1">
                      {isSo
                        ? 'Priority 1 ayaa horta dalabka qaadanaya. Haddii uu mashquul yahay ama offline yahay, priority-ga xiga ayaa qaadanaya.'
                        : 'Priority 1 takes the order first. If it is busy or offline, the next priority takes it.'}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => toggleDevice(item.id, item.is_active)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${item.is_active ? 'bg-white/20 text-white' : 'bg-white/30 text-white'}`}>
                        <Power className="w-3 h-3" /> {item.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => setEditDevice(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white">
                        <Edit className="w-3 h-3" /> {isSo ? 'Wax ka Badal' : 'Edit'}
                      </button>
                      <button onClick={() => setDeleteDevice(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/30 text-white">
                        <Trash2 className="w-3 h-3" /> {isSo ? 'Tir' : 'Delete'}
                      </button>
                    </div>
                    <div className="text-[10px] opacity-50 font-mono truncate">ID: {item.device_id}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      {editDevice && (
        <EditDeviceDialog
          open={!!editDevice}
          onOpenChange={(open) => { if (!open) setEditDevice(null); }}
          device={editDevice}
          onSuccess={() => { setEditDevice(null); loadDevices(); }}
        />
      )}

      {/* Delete Dialog */}
      {deleteDevice && (
        <DeleteDeviceDialog
          open={!!deleteDevice}
          onOpenChange={(open) => { if (!open) setDeleteDevice(null); }}
          device={deleteDevice}
          onSuccess={() => { setDeleteDevice(null); loadDevices(); }}
        />
      )}
    </div>
  );
};

// ========== BLOCKED USERS ==========
export const BlockedCustomView = ({ isSo }: { isSo: boolean }) => {
  const [blocked, setBlocked] = useState<any[]>([]);
  const [blockedPayments, setBlockedPayments] = useState<Record<string, { total: number; count: number }>>({});
  const [blockedOrders, setBlockedOrders] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [alertOrder, setAlertOrder] = useState<{ phone: string; order: any } | null>(null);
  const blockedRef = useRef<any[]>([]);

  const getPhoneVariants = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const vars = [digits];
    if (digits.startsWith('252')) vars.push(digits.slice(3));
    else vars.push('252' + digits);
    return vars;
  };

  const matchesPhone = (testPhone: string, originalPhone: string) => {
    const t = (testPhone || '').replace(/\D/g, '');
    return getPhoneVariants(originalPhone).includes(t);
  };

  const loadBlocked = useCallback(async () => {
    const { data } = await supabase.from('blocked_users').select('*').eq('is_active', true).order('created_at', { ascending: false });
    const blockedList = data || [];
    setBlocked(blockedList);
    blockedRef.current = blockedList;

    if (blockedList.length > 0) {
      const phones = blockedList.map((b: any) => b.phone_number);
      const allPhoneVariants = phones.flatMap((p: string) => getPhoneVariants(p));

      const [receiptsRes, ordersRes] = await Promise.all([
        supabase.from('payment_receipts').select('sender_phone, amount').in('sender_phone', allPhoneVariants),
        supabase.from('orders').select('id, customer_phone, sender_phone, receiver_phone, package_name, selling_price, status, delivery_status, created_at, data_amount').or(
          `customer_phone.in.(${allPhoneVariants.join(',')}),sender_phone.in.(${allPhoneVariants.join(',')})`
        ).order('created_at', { ascending: false }),
      ]);

      const paymentMap: Record<string, { total: number; count: number }> = {};
      (receiptsRes.data || []).forEach((r: any) => {
        for (const bp of phones) {
          if (matchesPhone(r.sender_phone, bp)) {
            paymentMap[bp] = paymentMap[bp] || { total: 0, count: 0 };
            paymentMap[bp].total += r.amount;
            paymentMap[bp].count += 1;
          }
        }
      });
      setBlockedPayments(paymentMap);

      const orderMap: Record<string, any[]> = {};
      (ordersRes.data || []).forEach((o: any) => {
        for (const bp of phones) {
          if (matchesPhone(o.customer_phone, bp) || matchesPhone(o.sender_phone, bp)) {
            orderMap[bp] = orderMap[bp] || [];
            orderMap[bp].push(o);
          }
        }
      });
      setBlockedOrders(orderMap);
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);
  useRealtimeRefresh(['blocked_users'], loadBlocked, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  // Listen for new orders from blocked users
  useEffect(() => {
    const channel = supabase.channel('blocked-orders-alert')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: any) => {
        const order = payload.new;
        const currentBlocked = blockedRef.current;
        for (const b of currentBlocked) {
          if (matchesPhone(order.customer_phone || '', b.phone_number) || matchesPhone(order.sender_phone || '', b.phone_number)) {
            // Alert! Blocked user placed an order
            setAlertOrder({ phone: b.phone_number, order });
            setExpandedId(b.id);
            // Re-fetch to update orders list
            loadBlocked();
            // Play alert sound
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZaXl5aTjoeAeXRxcHR5gIiPlpmcnJuYk42HgHlybnBzdnyEi5KXmpycm5iSjIV+d3Fuc3d8g4qRlpqcnJuYk42Gf3hybXJ3fISLkpibnZ2cm5iSjIV+d3FuaW1yd4CIkJebnp+fnZqVj4l/d3BrZ2twdoGJkpicn6CfnZqVkImBeHBqZmtwd4KKk5mdn6GgnpuWkYqBeHBqZWludoGKk5mdoKGhn5yXkYqBeXFqZWpudoGKkpmeoKGhn5yXkYqBeXBqZGpud4KLk5qeoaKhoJ2YkouCeXFqZGludoKLk5qeoaKhoJ2YkouCeXBpZGlud4KLlJqfoaKioJ2Yk4uCeXBpY2lud4KMlJufoaOioJ6Zk4uCeXBpY2lud4KMlJufoaOioJ6ZlIuDeXBpY2lueIKMlJugoaOioJ6ZlIuDeXFpY2lueIOMlZugoaOioZ+ZlIyDenFpY2lueIONlZygoaOioZ+ZlIyDenFqZGlueIONlZygoaSioZ+alIyDenFqZGpveIONlZygoaSioZ+alIyEenFqZGpveIONlp2hoaSioZ+alY2EenFqZGpveYSNlp2hoaSjop+alY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpv');
              audio.volume = 0.8;
              audio.play().catch(() => {});
            } catch {}
            toast.error(
              isSo
                ? `⚠️ DIGNIIN! Qof la xiray (${b.phone_number}) ayaa dalab cusub sameeyay!`
                : `⚠️ ALERT! Blocked user (${b.phone_number}) placed a new order!`,
              { duration: 10000 }
            );
            break;
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadBlocked]);

  const unblockUser = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa?' : 'Unblock this user?')) return;
    await supabase.from('blocked_users').update({ is_active: false, unblocked_at: new Date().toISOString() }).eq('id', id);
    setBlocked(prev => prev.filter(b => b.id !== id));
    toast.success(isSo ? 'Waa la furay' : 'Unblocked');
  };

  const blockUser = async () => {
    if (!newPhone.trim()) return;
    const { data, error } = await supabase.from('blocked_users').insert({ phone_number: newPhone.trim(), reason: newReason.trim() || null, is_active: true }).select().single();
    if (error) { toast.error('Error'); return; }
    setBlocked(prev => [data, ...prev]);
    setNewPhone(''); setNewReason('');
    toast.success(isSo ? 'Waa la xiray' : 'User blocked');
  };

  const getStatusColor = (status: string) => {
    if (status === 'delivered') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status === 'failed' || status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  };

  return (
    <div className="space-y-3">
      {/* Alert banner for blocked user order */}
      {alertOrder && (
        <div className="bg-red-600 text-white rounded-xl p-3 shadow-lg animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚨</span>
              <div>
                <div className="text-sm font-bold">{isSo ? 'DIGNIIN! Qof la xiray ayaa dalab sameeyay!' : 'ALERT! Blocked user placed an order!'}</div>
                <div className="text-xs opacity-90">{formatPhone(alertOrder.phone)} → {alertOrder.order.package_name} (${alertOrder.order.selling_price?.toFixed(2)})</div>
              </div>
            </div>
            <button onClick={() => setAlertOrder(null)} className="text-white/80 hover:text-white text-lg font-bold px-2">✕</button>
          </div>
        </div>
      )}
      <StatCardsRow cards={[
        { label: isSo ? 'La xiray' : 'Blocked', value: blocked.length, icon: Ban, color: 'bg-red-500' },
      ]} />
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">➕ {isSo ? 'User Cusub Block' : 'Block New User'}</div>
        <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder={isSo ? 'Lambarka...' : 'Phone number...'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
        <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder={isSo ? 'Sababta...' : 'Reason (optional)...'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
        <button onClick={blockUser} className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-medium active:bg-red-600">
          <Ban className="w-3.5 h-3.5 inline mr-1" /> {isSo ? 'Xir' : 'Block'}
        </button>
      </div>
      {loading ? <LazyFallback /> : blocked.length === 0 ? <EmptyState message={isSo ? 'Wax la xirin' : 'No blocked users'} /> : (
        <div className="space-y-2">
          {blocked.map((item) => {
            const isExpanded = expandedId === item.id;
            const orders = blockedOrders[item.phone_number] || [];
            const payments = blockedPayments[item.phone_number];
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-100 dark:border-red-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Ban className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">{formatPhone(item.phone_number)}</div>
                      <div className="text-[11px] text-gray-400">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {orders.length > 0 && (
                      <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">{orders.length} {isSo ? 'dalab' : 'orders'}</span>
                    )}
                    <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Blocked</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                      { icon: Phone, label: isSo ? 'Lambarka' : 'Phone', value: item.phone_number, color: 'text-red-500' },
                      { icon: DollarSign, label: isSo ? 'Lacag soo diray' : 'Total Sent', value: payments ? `$${payments.total.toFixed(2)} (${payments.count} ${isSo ? 'lacag' : 'payments'})` : (isSo ? 'Wax lacag ah ma jirto' : 'No payments'), color: 'text-emerald-500' },
                      { icon: Package, label: isSo ? 'Dalabyada' : 'Orders', value: `${orders.length}`, color: 'text-blue-500' },
                      { icon: Calendar, label: isSo ? 'La xiray' : 'Blocked', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-gray-500' },
                    ]} notes={item.reason} actions={<ActionBtn onClick={() => unblockUser(item.id)} icon={CheckCircle} label={isSo ? 'Fur' : 'Unblock'} variant="success" />} />

                    {orders.length > 0 && (
                      <div className="px-3 pb-3">
                        <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          {isSo ? 'Dalabyada uu sameeyay' : 'Orders placed'}
                        </div>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {orders.map((order: any) => (
                            <div key={order.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-800 dark:text-white truncate">{order.package_name}</div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                  <span>{formatPhone(order.receiver_phone)}</span>
                                  <span>•</span>
                                  <span>{formatDate(order.created_at)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-2 shrink-0">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">${order.selling_price?.toFixed(2)}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${getStatusColor(order.status)}`}>
                                  {order.status === 'delivered' ? '✓' : order.status === 'failed' || order.status === 'cancelled' ? '✗' : '⏳'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};