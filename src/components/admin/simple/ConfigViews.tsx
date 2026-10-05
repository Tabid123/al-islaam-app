import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, InvoiceAccordionContent, InvoiceRow, ActionBtn,
  LazyFallback, EmptyState, SearchInput, ImageUploader, ProviderFilterRow,
  formatDate, formatTime,
  Globe, Package, DollarSign, CheckCircle, XCircle, Hash, Calendar, Code, Settings, Star,
  Pencil, Power, Trash2, Plus, ChevronDown, Image, CreditCard, Phone,
} from './shared';
import { FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { validateUssdTemplate } from '@/lib/ussdValidator';
import { calculateAlIslaamProfit, isUssdFlowCode } from '@/lib/profit';

// Network hiccups (mobile data / backgrounded webview) surface as
// "TypeError: Load failed" / "Failed to fetch". Retry those transparently.
const isNetworkError = (msg?: string) =>
  !!msg && /load failed|failed to fetch|network|fetch/i.test(msg);

async function withRetry(
  run: () => Promise<any>,
  attempts = 3,
): Promise<any> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    last = await run();
    if (!last.error || !isNetworkError(last.error?.message)) return last;
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  return last;
}

// Helper: swap display_order of two adjacent rows in a table, then refresh.
async function swapOrder<T extends { id: string; display_order?: number | null }>(
  table: string,
  list: T[],
  index: number,
  dir: -1 | 1,
  reload: () => Promise<void> | void,
) {
  const swapWith = index + dir;
  if (swapWith < 0 || swapWith >= list.length) return;
  const a = list[index];
  const b = list[swapWith];
  const ao = Number(a.display_order ?? index);
  const bo = Number(b.display_order ?? swapWith);
  // If equal (e.g. both 0), use index+1 fallback so values differ.
  const newAo = bo === ao ? swapWith + 1 : bo;
  const newBo = bo === ao ? index + 1 : ao;
  await Promise.all([
    (supabase as any).from(table).update({ display_order: newAo }).eq('id', a.id),
    (supabase as any).from(table).update({ display_order: newBo }).eq('id', b.id),
  ]);
  await reload();
}

const OrderArrows = ({ onUp, onDown, disabledUp, disabledDown }: { onUp: () => void; onDown: () => void; disabledUp?: boolean; disabledDown?: boolean }) => (
  <div className="flex flex-col gap-px shrink-0" onClick={(e) => e.stopPropagation()}>
    <button onClick={(e) => { e.stopPropagation(); onUp(); }} disabled={disabledUp}
      className={`w-6 h-4 flex items-center justify-center rounded ${disabledUp ? 'opacity-30' : 'bg-gray-100 dark:bg-gray-700 active:bg-gray-200'}`}>
      <ArrowUp className="w-3 h-3 text-gray-600 dark:text-gray-300" />
    </button>
    <button onClick={(e) => { e.stopPropagation(); onDown(); }} disabled={disabledDown}
      className={`w-6 h-4 flex items-center justify-center rounded ${disabledDown ? 'opacity-30' : 'bg-gray-100 dark:bg-gray-700 active:bg-gray-200'}`}>
      <ArrowDown className="w-3 h-3 text-gray-600 dark:text-gray-300" />
    </button>
  </div>
);

// ========== PROVIDERS ==========
export const ProvidersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProv, setNewProv] = useState({ provider_name: '', evoucher_rate: '0', promotional_text: '', provider_logo: '' });

  const loadProviders = useCallback(async () => {
    const { data } = await supabase.from('providers_config').select('*').order('display_order');
    setProviders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);
  useRealtimeRefresh(['providers_config'], loadProviders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const toggleProvider = async (id: string, currentStatus: boolean) => {
    await supabase.from('providers_config').update({ is_active: !currentStatus }).eq('id', id);
    setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
  };

  const deleteProvider = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto?' : 'Delete this provider?')) return;
    await supabase.from('providers_config').delete().eq('id', id);
    setProviders(prev => prev.filter(p => p.id !== id));
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const saveProvider = async () => {
    if (!newProv.provider_name) { toast.error(isSo ? 'Magaca buuxi' : 'Fill provider name'); return; }
    const payload = {
      provider_name: newProv.provider_name, evoucher_rate: Number(newProv.evoucher_rate || 0),
      promotional_text: newProv.promotional_text || null, provider_logo: newProv.provider_logo || null,
    };
    if (editingId) {
      const { error } = await supabase.from('providers_config').update(payload).eq('id', editingId);
      if (error) { toast.error('Error: ' + error.message); return; }
      setProviders(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
      toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
    } else {
      const { data, error } = await supabase.from('providers_config').insert(payload).select().single();
      if (error) { toast.error('Error: ' + error.message); return; }
      setProviders(prev => [data, ...prev]);
      toast.success(isSo ? 'Waa lagu daray' : 'Added');
    }
    setNewProv({ provider_name: '', evoucher_rate: '0', promotional_text: '', provider_logo: '' });
    setShowAdd(false); setEditingId(null);
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setNewProv({ provider_name: item.provider_name, evoucher_rate: String(item.evoucher_rate || 0), promotional_text: item.promotional_text || '', provider_logo: item.provider_logo || '' });
    setShowAdd(true); setExpandedId(null);
  };

  const activeCount = providers.filter(p => p.is_active).length;

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: providers.length, icon: Globe, color: 'bg-purple-500' },
        { label: 'Active', value: activeCount, icon: CheckCircle, color: 'bg-green-500' },
        { label: 'Inactive', value: providers.length - activeCount, icon: XCircle, color: 'bg-red-500' },
      ]} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewProv({ provider_name: '', evoucher_rate: '0', promotional_text: '', provider_logo: '' }); }}
        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Provider Cusub Ku Dar' : 'Add New Provider'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{editingId ? (isSo ? '✏️ Wax ka Beddel' : '✏️ Edit Provider') : (isSo ? '➕ Provider Cusub' : '➕ New Provider')}</div>
          <input value={newProv.provider_name} onChange={e => setNewProv(p => ({...p, provider_name: e.target.value}))} placeholder={isSo ? 'Magaca Provider' : 'Provider Name'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <input value={newProv.evoucher_rate} onChange={e => setNewProv(p => ({...p, evoucher_rate: e.target.value}))} placeholder="E-Voucher Rate %" type="number" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <ImageUploader value={newProv.provider_logo} onChange={url => setNewProv(p => ({...p, provider_logo: url}))} bucket="provider-logos" label={isSo ? 'Logo-ga Shirkadda' : 'Provider Logo'} />
          <input value={newProv.promotional_text} onChange={e => setNewProv(p => ({...p, promotional_text: e.target.value}))} placeholder="Promo Text (optional)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="flex gap-2">
            <button onClick={saveProvider} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium active:bg-green-600">
              {editingId ? (isSo ? '💾 Kaydi' : '💾 Save') : (isSo ? '➕ Ku Dar' : '➕ Add')}
            </button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      {loading ? <LazyFallback /> : providers.length === 0 ? <EmptyState message="No providers" /> : (
        <div className="space-y-2">
          {providers.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <div className="w-full px-3 py-2.5 flex items-center gap-2 active:bg-purple-50/50">
                  <OrderArrows
                    onUp={() => swapOrder('providers_config', providers, idx, -1, loadProviders)}
                    onDown={() => swapOrder('providers_config', providers, idx, 1, loadProviders)}
                    disabledUp={idx === 0} disabledDown={idx === providers.length - 1} />
                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="flex-1 flex items-center gap-3 text-left">
                    {item.provider_logo && <img src={item.provider_logo} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                    <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800 dark:text-white">{item.provider_name}</div></div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: Globe, label: 'Provider', value: item.provider_name, color: 'text-purple-500' },
                    { icon: DollarSign, label: 'E-Voucher Rate', value: `${item.evoucher_rate}%`, color: 'text-emerald-500' },
                    { icon: Hash, label: 'Display Order', value: `${item.display_order}`, color: 'text-blue-500' },
                    { icon: FileText, label: 'Promo', value: item.promotional_text || '—', color: 'text-orange-500' },
                    { icon: Calendar, label: 'Created', value: formatDate(item.created_at), color: 'text-gray-500' },
                  ]} actions={
                    <>
                      <ActionBtn onClick={() => startEdit(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />
                      <ActionBtn onClick={() => toggleProvider(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
                      <ActionBtn onClick={() => deleteProvider(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
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

// ========== PACKAGES ==========
export const PackagesCustomView = ({ isSo }: { isSo: boolean }) => {
  const [packages, setPackages] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPkg, setNewPkg] = useState({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data', phone_prefix: '', menu1: '', menu2: '', sim_password: '', somlink_bundle_id: '', secret_prices: '' });

  const parseSecretPrices = (raw: string): number[] => Array.from(new Set(
    String(raw || '')
      .split(/[,;\s]+/)
      .map(v => Number(v.trim()))
      .filter(v => Number.isFinite(v) && v > 0)
  ));

  const secretPricesOf = (pkg: any): number[] => {
    const arr = Array.isArray(pkg?.secret_prices) ? pkg.secret_prices : [];
    const legacy = pkg?.secret_price != null ? [pkg.secret_price] : [];
    return Array.from(new Set([...arr, ...legacy].map(Number).filter(v => Number.isFinite(v) && v > 0)));
  };

  const loadPackages = useCallback(async () => {
    const [pkgRes, provRes, catRes] = await Promise.all([
      supabase.from('data_packages_config').select('*').order('display_order').limit(500),
      supabase.from('providers_config').select('id, provider_name, provider_logo, evoucher_rate').order('display_order'),
      supabase.from('package_categories').select('*').order('display_order'),
    ]);
    setPackages(pkgRes.data || []);
    setProviders(provRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadPackages(); }, [loadPackages]);
  useRealtimeRefresh(['data_packages_config', 'providers_config', 'package_categories'], loadPackages, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const togglePackage = async (id: string, currentStatus: boolean) => {
    await supabase.from('data_packages_config').update({ is_active: !currentStatus }).eq('id', id);
    setPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
  };

  const updatePackageOrder = async (id: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) { toast.error(isSo ? 'Lambar sax ah geli' : 'Enter a valid number'); return; }
    const { error } = await supabase.from('data_packages_config').update({ display_order: num }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setPackages(prev => [...prev.map(p => p.id === id ? { ...p, display_order: num } : p)]
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    toast.success(isSo ? 'Kala horreynta waa la kaydiyay' : 'Order saved');
  };


  const deletePackage = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto package-kan?' : 'Delete this package?')) return;
    await supabase.from('data_packages_config').delete().eq('id', id);
    setPackages(prev => prev.filter(p => p.id !== id));
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const savePackage = async () => {
    if (!newPkg.package_name || !newPkg.selling_price || !newPkg.provider_id) { toast.error(isSo ? 'Buuxi meelaha lagama maarmaanka ah' : 'Fill required fields'); return; }
    const ussdCheck = validateUssdTemplate(newPkg.ussd_code || '');
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }

    const secretPrices = parseSecretPrices(newPkg.secret_prices);
    const incomingPrices = [Number(newPkg.selling_price), ...secretPrices];
    const conflict = packages.find(pkg => {
      if (pkg.id === editingId || pkg.provider_id !== newPkg.provider_id || pkg.is_active === false) return false;
      const existingPrices = [Number(pkg.selling_price), ...secretPricesOf(pkg)];
      return incomingPrices.some(price => Number.isFinite(price) && existingPrices.some(existing => Math.abs(existing - price) < 0.000001));
    });
    if (conflict) {
      const proceed = window.confirm(
        `${isSo ? 'Digniin' : 'Warning'}: ${conflict.package_name} ${isSo ? 'wuxuu leeyahay qiime isku mid ah. Lacagta soo gasha way adkaan kartaa in package sax ah lagu garto. Sii wad?' : 'already uses one of these prices. Incoming-payment matching may become ambiguous. Continue?'}`
      );
      if (!proceed) return;
    }
    // Comma/pipe waa separator-ka template-ka — waxaa lagu badalayaa space, laakiin qoraalka waa la ogol yahay
    const cleanMenuField = (s: string) => (s || '').replace(/[,|]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanPin = (s: string) => (s || '').replace(/\D/g, '').slice(0, 12);
    const payload: any = {
      package_name: newPkg.package_name, data_amount: newPkg.data_amount, selling_price: Number(newPkg.selling_price),
      cost_price: Number(newPkg.cost_price || 0), validity_days: newPkg.validity_days, provider_id: newPkg.provider_id,
      category_id: newPkg.category_id || null, ussd_code: newPkg.ussd_code || null, connection_type_label: newPkg.connection_type_label,
      phone_prefix: (newPkg.phone_prefix || '')
        .split(/[,\/\s]+/)
        .map(s => s.replace(/\D/g, ''))
        .filter(Boolean)
        .join(',') || null,
      // Flow *870* only — waxaa lagu isticmaalaa marka delivery_instruction template uu ku bilaabmo *870*
      menu1: cleanMenuField(newPkg.menu1) || null,
      menu2: cleanMenuField(newPkg.menu2) || null,
      sim_password: cleanPin(newPkg.sim_password) || null,
      somlink_bundle_id: newPkg.somlink_bundle_id ? Number(newPkg.somlink_bundle_id) : null,
      secret_prices: secretPrices,
      secret_price: secretPrices[0] ?? null,
    };
    if (editingId) {
      const { error } = await withRetry(() =>
        supabase.from('data_packages_config').update(payload).eq('id', editingId) as any,
      );
      if (error) {
        toast.error(isNetworkError(error.message)
          ? (isSo ? 'Internet-ku wuu go\'ay — isku day mar kale' : 'Network error — please try again')
          : 'Error: ' + error.message);
        return;
      }
      setPackages(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
      toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
    } else {
      const { data, error } = await withRetry(() =>
        supabase.from('data_packages_config').insert(payload).select().single() as any,
      );
      if (error) {
        toast.error(isNetworkError(error.message)
          ? (isSo ? 'Internet-ku wuu go\'ay — isku day mar kale' : 'Network error — please try again')
          : 'Error: ' + error.message);
        return;
      }
      setPackages(prev => [data, ...prev]);
      toast.success(isSo ? 'Waa lagu daray' : 'Added');
    }
    setNewPkg({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data', phone_prefix: '', menu1: '', menu2: '', sim_password: '', somlink_bundle_id: '', secret_prices: '' });
    setShowAdd(false); setEditingId(null);
  };

  const startEditPkg = (item: any) => {
    setEditingId(item.id);
    setNewPkg({
      package_name: item.package_name || '', data_amount: item.data_amount || '', selling_price: String(item.selling_price || ''),
      cost_price: String(item.cost_price || ''), validity_days: item.validity_days || '30', provider_id: item.provider_id || '',
      category_id: item.category_id || '', ussd_code: item.ussd_code || '', connection_type_label: item.connection_type_label || 'Data',
      phone_prefix: item.phone_prefix || '',
      menu1: item.menu1 || '', menu2: item.menu2 || '', sim_password: item.sim_password || '',
      somlink_bundle_id: item.somlink_bundle_id != null ? String(item.somlink_bundle_id) : '',
      secret_prices: secretPricesOf(item).join(', '),
    });
    setShowAdd(true); setExpandedId(null);
  };

  const providerFiltered = providerFilter === 'all' ? packages : packages.filter(p => p.provider_id === providerFilter);
  const activeCount = providerFiltered.filter(p => p.is_active).length;
  const filtered = search ? providerFiltered.filter(p => p.package_name?.toLowerCase().includes(search.toLowerCase()) || p.data_amount?.includes(search)) : providerFiltered;
  const getProviderName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const getProviderLogo = (id: string) => providers.find(p => p.id === id)?.provider_logo || '';
  const getProviderEvoucherRate = (id: string) => Number(providers.find(p => p.id === id)?.evoucher_rate || 0);
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.category_name || '—';
  const getCategoryImage = (id: string) => categories.find(c => c.id === id)?.category_image || '';
  const addFormCategories = newPkg.provider_id ? categories.filter(c => c.provider_id === newPkg.provider_id) : [];

  const renderPackageCard = (item: any) => {
    const isExpanded = expandedId === item.id;
    const evRate = getProviderEvoucherRate(item.provider_id);
    const isFlow = Boolean(item.is_discovery_root) || isUssdFlowCode(item.ussd_code);
    const profit = calculateAlIslaamProfit(Number(item.selling_price), Number(item.cost_price || 0), evRate, isFlow);
    return (
      <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
        <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{item.package_name}</div>
            <div className="text-[11px] text-gray-400">{item.data_amount} · {item.validity_days}d</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-sm text-purple-600">${Number(item.selling_price).toFixed(2)}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'On' : 'Off'}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {isExpanded && (
          <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
            { icon: Globe, label: 'Provider', value: getProviderName(item.provider_id), color: 'text-indigo-500' },
            { icon: Package, label: 'Category', value: getCategoryName(item.category_id), color: 'text-emerald-500' },
            { icon: Package, label: 'Package', value: item.package_name, color: 'text-purple-500' },
            { icon: Hash, label: 'Data', value: item.data_amount, color: 'text-cyan-500' },
            { icon: Calendar, label: 'Validity', value: `${item.validity_days} days`, color: 'text-blue-500' },
            { icon: DollarSign, label: isSo ? 'Iibka' : 'Sell Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
            { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: `${Number(item.cost_price || 0).toFixed(2)}`, color: 'text-red-500' },
            ...(secretPricesOf(item).length > 0 ? [{ icon: DollarSign, label: '🔒 Only Me', value: secretPricesOf(item).map(v => `${v.toFixed(2)}`).join(', '), color: 'text-violet-600' }] : []),
            { icon: DollarSign, label: isSo ? "Faa'iido" : 'Profit', value: `${profit.toFixed(2)}`, color: 'text-green-600' },
            ...(evRate > 0 ? [{ icon: Hash, label: 'E-Voucher', value: `${(evRate * 100).toFixed(1)}%`, color: 'text-amber-500' }] : []),
            { icon: Settings, label: 'Connection', value: item.connection_type_label || '—', color: 'text-gray-500' },
            ...(item.ussd_code ? [{ icon: Code, label: 'USSD', value: item.ussd_code, color: 'text-indigo-500' }] : []),
          ]} actions={
            <>
              <div className="flex items-center gap-1.5 mr-1">
                <span className="text-[10px] text-gray-500">{isSo ? 'Kala horreyn' : 'Order'}</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={item.display_order ?? 0}
                  onBlur={(e) => {
                    if (String(item.display_order ?? 0) !== e.target.value.trim()) updatePackageOrder(item.id, e.target.value);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-14 px-2 py-1 text-xs rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 outline-none"
                />
              </div>
              <ActionBtn onClick={() => startEditPkg(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />

              <ActionBtn onClick={() => togglePackage(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Off' : 'On'} variant="warning" />
              <ActionBtn onClick={() => deletePackage(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
            </>
          } />
        )}
      </div>
    );
  };

  const buildGroupedView = () => {
    const provList = providerFilter === 'all' ? providers.filter(prov => filtered.some(p => p.provider_id === prov.id)) : [providers.find(p => p.id === providerFilter)].filter(Boolean);
    return provList.map(prov => {
      const provPkgs = filtered.filter(p => p.provider_id === prov.id);
      if (provPkgs.length === 0) return null;
      const provCats = categories.filter(c => c.provider_id === prov.id && provPkgs.some(p => p.category_id === c.id));
      const uncategorized = provPkgs.filter(p => !p.category_id || !categories.some(c => c.id === p.category_id));
      return (
        <div key={prov.id} className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-1">
            {prov.provider_logo && <img src={prov.provider_logo} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-purple-200" />}
            <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{prov.provider_name}</span>
            <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">{provPkgs.length}</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
          {provCats.map(cat => {
            const catPkgs = provPkgs.filter(p => p.category_id === cat.id);
            if (catPkgs.length === 0) return null;
            return (
              <div key={cat.id} className="ml-2">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  {cat.category_image ? <img src={cat.category_image} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0" /> : prov.provider_logo ? <img src={prov.provider_logo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 opacity-60" /> : null}
                  <span className="font-semibold text-xs text-gray-600 dark:text-gray-300">{cat.category_name}</span>
                  <span className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded-full">{catPkgs.length}</span>
                </div>
                <div className="space-y-1.5">{catPkgs.map(renderPackageCard)}</div>
              </div>
            );
          })}
          {uncategorized.length > 0 && (
            <div className="ml-2">
              <div className="text-[10px] text-gray-400 font-medium mb-1 px-1">{isSo ? 'Category la\'aan' : 'Uncategorized'}</div>
              <div className="space-y-1.5">{uncategorized.map(renderPackageCard)}</div>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: providerFiltered.length, icon: Package, color: 'bg-purple-500' },
        { label: 'Active', value: activeCount, icon: CheckCircle, color: 'bg-green-500' },
        { label: 'Inactive', value: providerFiltered.length - activeCount, icon: XCircle, color: 'bg-red-500' },
      ]} />
      <ProviderFilterRow providers={providers} activeId={providerFilter} onSelect={setProviderFilter}
        activeColor="bg-cyan-600" totalCount={packages.length} allLabel={isSo ? 'Dhammaan' : 'All'}
        countFn={id => packages.filter(p => p.provider_id === id).length} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewPkg({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data', phone_prefix: '', menu1: '', menu2: '', sim_password: '', somlink_bundle_id: '', secret_prices: '' }); }}
        className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Package Cusub Ku Dar' : 'Add New Package'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{editingId ? '✏️ Edit' : '➕ New'}</div>
          <select value={newPkg.provider_id} onChange={e => setNewPkg(p => ({...p, provider_id: e.target.value, category_id: ''}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">{isSo ? 'Dooro Provider *' : 'Select Provider *'}</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          {addFormCategories.length > 0 && (
            <select value={newPkg.category_id} onChange={e => setNewPkg(p => ({...p, category_id: e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
              <option value="">{isSo ? 'Dooro Category' : 'Select Category'}</option>
              {addFormCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
            </select>
          )}
          <input value={newPkg.package_name} onChange={e => setNewPkg(p => ({...p, package_name: e.target.value}))} placeholder="Package Name *" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <input value={newPkg.data_amount} onChange={e => setNewPkg(p => ({...p, data_amount: e.target.value}))} placeholder="Data Amount" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
            <input value={newPkg.validity_days} onChange={e => setNewPkg(p => ({...p, validity_days: e.target.value}))} placeholder="Days" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={newPkg.selling_price} onChange={e => setNewPkg(p => ({...p, selling_price: e.target.value}))} placeholder="Sell Price *" type="number" step="0.01" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
            <input value={newPkg.cost_price} onChange={e => setNewPkg(p => ({...p, cost_price: e.target.value}))} placeholder="Cost Price" type="number" step="0.01" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          </div>
          <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
            <div className="text-[11px] font-bold text-violet-700 dark:text-violet-300 mb-1">🔒 {isSo ? 'Qiimooyin Gaar ah (Only Me)' : 'Private Prices (Only Me)'}</div>
            <input
              value={newPkg.secret_prices}
              onChange={e => setNewPkg(p => ({ ...p, secret_prices: e.target.value }))}
              placeholder="0.31, 0.35, 0.40"
              inputMode="decimal"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border text-sm outline-none font-mono"
            />
            <div className="text-[9px] text-violet-600 dark:text-violet-400 mt-1">
              {isSo ? 'Kala saar comma. Macmiilku ma arko; lacag soo gasha ayaa lagu garan karaa package-kan.' : 'Comma-separated. Hidden from customers; incoming payments can match these prices.'}
            </div>
          </div>
          <input value={newPkg.phone_prefix} onChange={e => setNewPkg(p => ({...p, phone_prefix: e.target.value.replace(/[^0-9,\/\s]/g, '').slice(0, 20)}))} placeholder={isSo ? 'Phone Prefix (tusaale: 61 ama 61,77) - optional' : 'Phone Prefix (e.g. 61 or 61,77) - optional'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none font-mono" />
          <input value={newPkg.connection_type_label} onChange={e => setNewPkg(p => ({...p, connection_type_label: e.target.value}))} placeholder={isSo ? 'Nooca (tusaale: Data, ADSL, Minutes)' : 'Type label (e.g. Data, ADSL, Minutes)'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-1">
            <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
              {isSo ? '🔗 Somlink API Bundle ID' : '🔗 Somlink API Bundle ID'}
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400">
              {isSo ? 'Haddii aad rabto in xirmadan lagu diri karo Somlink API, geli bundle_id-ga.' : 'Optional. Set to enable "Send via Somlink" for this package.'}
            </div>
            <input value={newPkg.somlink_bundle_id} onChange={e => setNewPkg(p => ({...p, somlink_bundle_id: e.target.value.replace(/\D/g, '')}))} placeholder="e.g. 12" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border text-sm outline-none font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={savePackage} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium active:bg-green-600">
              {editingId ? '💾 Save' : '➕ Add'}
            </button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi...' : 'Search...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message="No packages" /> : (
        <div className="space-y-3">{buildGroupedView()}</div>
      )}
    </div>
  );
};

// ========== CATEGORIES ==========
export const CategoriesCustomView = ({ isSo }: { isSo: boolean }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ category_name: '', provider_id: '', category_image: '' });

  const loadCategories = useCallback(async () => {
    const [catRes, provRes, pkgRes, instRes] = await Promise.all([
      supabase.from('package_categories').select('*').order('display_order'),
      supabase.from('providers_config').select('id, provider_name, provider_logo').order('display_order'),
      supabase.from('data_packages_config').select('id, category_id, ussd_code, package_name').order('display_order').limit(500),
      supabase.from('delivery_instructions').select('id, category_id, ussd_code, code_template'),
    ]);
    setCategories(catRes.data || []);
    setProviders(provRes.data || []);
    setPackages(pkgRes.data || []);
    setInstructions(instRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useRealtimeRefresh(['package_categories', 'delivery_instructions'], loadCategories, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const toggleCategory = async (id: string, currentStatus: boolean) => {
    await supabase.from('package_categories').update({ is_active: !currentStatus }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: !c.is_active } : c));
    toast.success('Updated');
  };

  const deleteCategory = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa?' : 'Delete this category?')) return;
    await supabase.from('package_categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
    toast.success('Deleted');
  };

  const saveCategory = async () => {
    if (!newCat.category_name) { toast.error('Fill category name'); return; }
    const payload = { category_name: newCat.category_name, provider_id: newCat.provider_id || null, category_image: newCat.category_image || null };
    if (editingId) {
      const { error } = await supabase.from('package_categories').update(payload).eq('id', editingId);
      if (error) { toast.error('Error: ' + error.message); return; }
      setCategories(prev => prev.map(c => c.id === editingId ? { ...c, ...payload } : c));
    } else {
      const { data, error } = await supabase.from('package_categories').insert(payload).select().single();
      if (error) { toast.error('Error: ' + error.message); return; }
      setCategories(prev => [data, ...prev]);
    }
    setNewCat({ category_name: '', provider_id: '', category_image: '' });
    setShowAdd(false); setEditingId(null);
    toast.success(editingId ? 'Updated' : 'Added');
  };

  const startEditCat = (item: any) => {
    setEditingId(item.id);
    setNewCat({ category_name: item.category_name || '', provider_id: item.provider_id || '', category_image: item.category_image || '' });
    setShowAdd(true); setExpandedId(null);
  };

  const getProviderName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const getProviderLogo = (id: string) => providers.find(p => p.id === id)?.provider_logo || '';
  const getCatPackages = (catId: string) => packages.filter(p => p.category_id === catId);
  const getCatInstructions = (catId: string) => instructions.filter(i => i.category_id === catId);

  const providerFiltered = providerFilter === 'all' ? categories : categories.filter(c => c.provider_id === providerFilter);
  const activeCount = providerFiltered.filter(c => c.is_active).length;
  const groupedByProvider = providerFilter === 'all' ? providers.filter(prov => providerFiltered.some(c => c.provider_id === prov.id)) : [];
  const noProviderCats = providerFilter === 'all' ? providerFiltered.filter(c => !c.provider_id) : [];

  const renderCategoryCard = (item: any) => {
    const isExpanded = expandedId === item.id;
    const catPkgs = getCatPackages(item.id);
    const catInstrs = getCatInstructions(item.id);
    const ussdCodes = catPkgs.filter(p => p.ussd_code).map(p => `${p.package_name}: ${p.ussd_code}`);
    const instrCodes = catInstrs.filter(i => i.ussd_code || i.code_template).map(i => i.ussd_code || i.code_template);
    return (
      <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
        <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center gap-3 text-left active:bg-purple-50/50">
          {item.category_image && <img src={item.category_image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
          {!item.category_image && getProviderLogo(item.provider_id) && <img src={getProviderLogo(item.provider_id)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-800 dark:text-white">{item.category_name}</div>
            <div className="text-[11px] text-gray-400">{getProviderName(item.provider_id)} · {catPkgs.length} pkgs</div>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
        {isExpanded && (
          <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
            { icon: Package, label: 'Category', value: item.category_name, color: 'text-purple-500' },
            { icon: Globe, label: 'Provider', value: getProviderName(item.provider_id), color: 'text-indigo-500' },
            { icon: Hash, label: 'Packages', value: `${catPkgs.length}`, color: 'text-cyan-500' },
            { icon: Hash, label: 'Order', value: `${item.display_order}`, color: 'text-blue-500' },
            { icon: Calendar, label: 'Created', value: formatDate(item.created_at), color: 'text-gray-500' },
            ...(ussdCodes.length > 0 ? [{ icon: Code, label: 'Pkg USSD', value: ussdCodes.join(' | '), color: 'text-indigo-500' }] : []),
            ...(instrCodes.length > 0 ? [{ icon: Code, label: 'System USSD', value: instrCodes.join(' | '), color: 'text-orange-500' }] : []),
          ]} actions={
            <>
              <ActionBtn onClick={() => startEditCat(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />
              <ActionBtn onClick={() => toggleCategory(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
              <ActionBtn onClick={() => deleteCategory(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
            </>
          } />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: providerFiltered.length, icon: Package, color: 'bg-purple-500' },
        { label: 'Active', value: activeCount, icon: CheckCircle, color: 'bg-green-500' },
        { label: 'Inactive', value: providerFiltered.length - activeCount, icon: XCircle, color: 'bg-red-500' },
      ]} />
      <ProviderFilterRow providers={providers} activeId={providerFilter} onSelect={setProviderFilter}
        activeColor="bg-emerald-600" totalCount={categories.length} allLabel={isSo ? 'Dhammaan' : 'All'}
        countFn={id => categories.filter(c => c.provider_id === id).length} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewCat({ category_name: '', provider_id: '', category_image: '' }); }}
        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Category Cusub' : 'Add New Category'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <input value={newCat.category_name} onChange={e => setNewCat(p => ({...p, category_name: e.target.value}))} placeholder="Category Name *" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <select value={newCat.provider_id} onChange={e => setNewCat(p => ({...p, provider_id: e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">Select Provider</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          <ImageUploader value={newCat.category_image} onChange={url => setNewCat(p => ({...p, category_image: url}))} bucket="provider-logos" label="Category Image" />
          <div className="flex gap-2">
            <button onClick={saveCategory} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">{editingId ? '💾 Save' : '➕ Add'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      {loading ? <LazyFallback /> : providerFiltered.length === 0 ? <EmptyState message="No categories" /> : (
        <div className="space-y-3">
          {providerFilter === 'all' ? (
            <>
              {groupedByProvider.map(prov => {
                const provCats = providerFiltered.filter(c => c.provider_id === prov.id);
                if (provCats.length === 0) return null;
                return (
                  <div key={prov.id}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      {prov.provider_logo && <img src={prov.provider_logo} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-emerald-200" />}
                      <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{prov.provider_name}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{provCats.length}</span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                    <div className="space-y-2">{provCats.map(renderCategoryCard)}</div>
                  </div>
                );
              })}
              {noProviderCats.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="font-bold text-sm text-gray-500">{isSo ? "Provider La'aan" : 'No Provider'}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{noProviderCats.length}</span>
                  </div>
                  <div className="space-y-2">{noProviderCats.map(renderCategoryCard)}</div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">{providerFiltered.map(renderCategoryCard)}</div>
          )}
        </div>
      )}
    </div>
  );
};

// ========== FEATURED ==========
export const FeaturedCustomView = ({ isSo }: { isSo: boolean }) => {
  const [featured, setFeatured] = useState<any[]>([]);
  const [allPackages, setAllPackages] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newPkgId, setNewPkgId] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const loadFeatured = useCallback(async () => {
    const [featRes, pkgRes, provRes] = await Promise.all([
      supabase.from('featured_packages').select('*, data_packages_config(package_name, selling_price, data_amount, provider_id, ussd_code)').order('display_order'),
      supabase.from('data_packages_config').select('id, package_name, selling_price, provider_id').eq('is_active', true).order('package_name').limit(500),
      supabase.from('providers_config').select('id, provider_name, provider_logo').order('display_order'),
    ]);
    setFeatured(featRes.data || []);
    setAllPackages(pkgRes.data || []);
    setProviders(provRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadFeatured(); }, [loadFeatured]);
  useRealtimeRefresh(['featured_packages'], loadFeatured, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const removeFeatured = async (id: string) => {
    if (!confirm('Remove from featured?')) return;
    await supabase.from('featured_packages').delete().eq('id', id);
    setFeatured(prev => prev.filter(f => f.id !== id));
    toast.success('Removed');
  };

  const toggleFeatured = async (id: string, currentStatus: boolean) => {
    await supabase.from('featured_packages').update({ is_active: !currentStatus }).eq('id', id);
    setFeatured(prev => prev.map(f => f.id === id ? { ...f, is_active: !f.is_active } : f));
    toast.success('Updated');
  };

  const addFeatured = async () => {
    if (!newPkgId) { toast.error('Select a package'); return; }
    const { data, error } = await supabase.from('featured_packages').insert({ package_id: newPkgId }).select('*, data_packages_config(package_name, selling_price, data_amount, provider_id, ussd_code)').single();
    if (error) { toast.error('Error: ' + error.message); return; }
    setFeatured(prev => [data, ...prev]);
    setNewPkgId(''); setShowAdd(false);
    toast.success('Added');
  };

  const getProviderName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const getProviderLogo = (id: string) => providers.find(p => p.id === id)?.provider_logo || '';
  const providerFiltered = providerFilter === 'all' ? featured : featured.filter(f => f.data_packages_config?.provider_id === providerFilter);
  const groupedByProvider = providerFilter === 'all' ? providers.filter(prov => providerFiltered.some(f => f.data_packages_config?.provider_id === prov.id)) : [];

  const renderFeaturedCard = (item: any) => {
    const isExpanded = expandedId === item.id;
    const pkg = item.data_packages_config;
    const provId = pkg?.provider_id;
    return (
      <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-100/50 dark:border-amber-900/20 overflow-hidden">
        <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-amber-50/50">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {provId && getProviderLogo(provId) && <img src={getProviderLogo(provId)} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
            <Star className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{pkg?.package_name || 'Package'}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-sm text-amber-600">${Number(pkg?.selling_price || 0).toFixed(2)}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'On' : 'Off'}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {isExpanded && (
          <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
            { icon: Package, label: 'Package', value: pkg?.package_name || '—', color: 'text-purple-500' },
            { icon: Globe, label: 'Provider', value: provId ? getProviderName(provId) : '—', color: 'text-indigo-500' },
            { icon: Hash, label: 'Data', value: pkg?.data_amount || '—', color: 'text-cyan-500' },
            { icon: DollarSign, label: 'Price', value: `$${Number(pkg?.selling_price || 0).toFixed(2)}`, color: 'text-emerald-500' },
            ...(pkg?.ussd_code ? [{ icon: Code, label: 'USSD', value: pkg.ussd_code, color: 'text-indigo-500' }] : []),
          ]} actions={
            <>
              <ActionBtn onClick={() => toggleFeatured(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Off' : 'On'} variant="warning" />
              <ActionBtn onClick={() => removeFeatured(item.id)} icon={Trash2} label={isSo ? 'Ka saar' : 'Remove'} variant="danger" />
            </>
          } />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Featured', value: providerFiltered.length, icon: Star, color: 'bg-amber-500' },
        { label: 'Active', value: providerFiltered.filter(f => f.is_active).length, icon: CheckCircle, color: 'bg-green-500' },
      ]} />
      <ProviderFilterRow providers={providers} activeId={providerFilter} onSelect={setProviderFilter}
        activeColor="bg-amber-600" totalCount={featured.length} allLabel={isSo ? 'Dhammaan' : 'All'}
        countFn={id => featured.filter(f => f.data_packages_config?.provider_id === id).length} />
      <button onClick={() => setShowAdd(!showAdd)} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Featured Ku Dar' : 'Add Featured'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <select value={newPkgId} onChange={e => setNewPkgId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">Select Package</option>
            {allPackages.map(p => <option key={p.id} value={p.id}>{p.package_name} - ${p.selling_price}</option>)}
          </select>
          <button onClick={addFeatured} className="w-full py-2 bg-green-500 text-white rounded-lg text-sm font-medium">➕ Add</button>
        </div>
      )}
      {loading ? <LazyFallback /> : providerFiltered.length === 0 ? <EmptyState message="No featured packages" /> : (
        <div className="space-y-3">
          {providerFilter === 'all' ? groupedByProvider.map(prov => {
            const provFeat = providerFiltered.filter(f => f.data_packages_config?.provider_id === prov.id);
            if (provFeat.length === 0) return null;
            return (
              <div key={prov.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {prov.provider_logo && <img src={prov.provider_logo} alt="" className="w-7 h-7 rounded-full object-cover border-2 border-amber-200" />}
                  <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{prov.provider_name}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{provFeat.length}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">{provFeat.map(renderFeaturedCard)}</div>
              </div>
            );
          }) : <div className="space-y-2">{providerFiltered.map(renderFeaturedCard)}</div>}
        </div>
      )}
    </div>
  );
};

// ========== BANNERS (with Edit) ==========
export const BannersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newBanner, setNewBanner] = useState({ banner_image: '', alt_text: '' });

  const loadBanners = useCallback(async () => {
    const { data } = await supabase.from('banners_config').select('*').order('display_order');
    setBanners(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadBanners(); }, [loadBanners]);
  useRealtimeRefresh(['banners_config'], loadBanners, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const toggleBanner = async (id: string, currentStatus: boolean) => {
    await supabase.from('banners_config').update({ is_active: !currentStatus }).eq('id', id);
    setBanners(prev => prev.map(b => b.id === id ? { ...b, is_active: !b.is_active } : b));
    toast.success('Updated');
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    await supabase.from('banners_config').delete().eq('id', id);
    setBanners(prev => prev.filter(b => b.id !== id));
    toast.success('Deleted');
  };

  const saveBanner = async () => {
    if (!newBanner.banner_image) { toast.error('Fill image URL'); return; }
    const payload = { banner_image: newBanner.banner_image, alt_text: newBanner.alt_text || null };
    if (editingId) {
      const { error } = await supabase.from('banners_config').update(payload).eq('id', editingId);
      if (error) { toast.error('Error: ' + error.message); return; }
      setBanners(prev => prev.map(b => b.id === editingId ? { ...b, ...payload } : b));
      toast.success('Updated');
    } else {
      const { data, error } = await supabase.from('banners_config').insert(payload).select().single();
      if (error) { toast.error('Error: ' + error.message); return; }
      setBanners(prev => [data, ...prev]);
      toast.success('Added');
    }
    setNewBanner({ banner_image: '', alt_text: '' });
    setShowAdd(false); setEditingId(null);
  };

  const startEditBanner = (item: any) => {
    setEditingId(item.id);
    setNewBanner({ banner_image: item.banner_image || '', alt_text: item.alt_text || '' });
    setShowAdd(true); setExpandedId(null);
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: banners.length, icon: Image, color: 'bg-green-600' },
        { label: 'Active', value: banners.filter(b => b.is_active).length, icon: CheckCircle, color: 'bg-green-500' },
      ]} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewBanner({ banner_image: '', alt_text: '' }); }}
        className="w-full py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Banner Cusub' : 'Add New Banner'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{editingId ? '✏️ Edit Banner' : '➕ New Banner'}</div>
          <ImageUploader value={newBanner.banner_image} onChange={url => setNewBanner(p => ({...p, banner_image: url}))} bucket="banners" label={isSo ? 'Sawirka Banner' : 'Banner Image'} />
          <input value={newBanner.alt_text} onChange={e => setNewBanner(p => ({...p, alt_text: e.target.value}))} placeholder="Alt Text (optional)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="flex gap-2">
            <button onClick={saveBanner} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">{editingId ? '💾 Save' : '➕ Add'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      {loading ? <LazyFallback /> : banners.length === 0 ? <EmptyState message="No banners" /> : (
        <div className="space-y-2">
          {banners.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <div className="w-full px-3 py-2.5 flex items-center gap-2 active:bg-purple-50/50">
                  <OrderArrows
                    onUp={() => swapOrder('banners_config', banners, idx, -1, loadBanners)}
                    onDown={() => swapOrder('banners_config', banners, idx, 1, loadBanners)}
                    disabledUp={idx === 0} disabledDown={idx === banners.length - 1} />
                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="flex-1 flex items-center justify-between text-left">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Image className="w-4 h-4 text-rose-500 shrink-0" />
                      <div className="font-semibold text-sm text-gray-800 dark:text-white truncate">{item.alt_text || 'Banner'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-purple-200/50 dark:border-purple-900/30 bg-gradient-to-b from-purple-50/80 to-white dark:from-purple-950/20 dark:to-gray-800 animate-in slide-in-from-top-1 duration-150">
                    <div className="px-3 py-3 space-y-2">
                      {item.banner_image && <img src={item.banner_image} alt="" className="w-full h-28 object-cover rounded-lg" />}
                      <InvoiceRow icon={Hash} label="Order" value={`${item.display_order}`} color="text-blue-500" />
                      <InvoiceRow icon={Image} label="Type" value={item.media_type || 'image'} color="text-gray-500" />
                      <InvoiceRow icon={Calendar} label="Created" value={formatDate(item.created_at)} color="text-teal-500" />
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-purple-100 dark:border-purple-900/30">
                        <ActionBtn onClick={() => startEditBanner(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />
                        <ActionBtn onClick={() => toggleBanner(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
                        <ActionBtn onClick={() => deleteBanner(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
                      </div>
                      <div className="text-[8px] text-gray-300 font-mono text-center">ID: {item.id}</div>
                    </div>
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

// ========== PAYMENT SETTINGS (with Edit) ==========
export const PaymentSettingsCustomView = ({ isSo }: { isSo: boolean }) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPay, setNewPay] = useState({ provider_name: '', payment_mode: 'ussd', payment_number: '', commission_rate: '0', prefix_code: '', ussd_code_template: '', provider_logo: '' });

  const loadPaymentProviders = useCallback(async () => {
    const { data } = await supabase.from('payment_providers_config').select('*').order('display_order');
    setProviders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadPaymentProviders(); }, [loadPaymentProviders]);
  useRealtimeRefresh(['payment_providers_config'], loadPaymentProviders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const toggleProvider = async (id: string, currentStatus: boolean) => {
    await supabase.from('payment_providers_config').update({ is_active: !currentStatus }).eq('id', id);
    setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
    toast.success('Updated');
  };

  const deleteProvider = async (id: string) => {
    if (!confirm('Delete this payment provider?')) return;
    await supabase.from('payment_providers_config').delete().eq('id', id);
    setProviders(prev => prev.filter(p => p.id !== id));
    toast.success('Deleted');
  };

  const savePaymentProvider = async () => {
    if (!newPay.provider_name) { toast.error('Fill provider name'); return; }
    const payload = {
      provider_name: newPay.provider_name, payment_mode: newPay.payment_mode, payment_number: newPay.payment_number || null,
      commission_rate: Number(newPay.commission_rate || 0), prefix_code: newPay.prefix_code || null,
      ussd_code_template: newPay.ussd_code_template || null, provider_logo: newPay.provider_logo || null,
    };
    if (editingId) {
      const { error } = await supabase.from('payment_providers_config').update(payload).eq('id', editingId);
      if (error) { toast.error('Error: ' + error.message); return; }
      setProviders(prev => prev.map(p => p.id === editingId ? { ...p, ...payload } : p));
      toast.success('Updated');
    } else {
      const { data, error } = await supabase.from('payment_providers_config').insert(payload).select().single();
      if (error) { toast.error('Error: ' + error.message); return; }
      setProviders(prev => [data, ...prev]);
      toast.success('Added');
    }
    setNewPay({ provider_name: '', payment_mode: 'ussd', payment_number: '', commission_rate: '0', prefix_code: '', ussd_code_template: '', provider_logo: '' });
    setShowAdd(false); setEditingId(null);
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setNewPay({
      provider_name: item.provider_name || '', payment_mode: item.payment_mode || (item.provider_name?.toLowerCase() === 'waafipay' ? 'waafipay_api' : 'ussd'), payment_number: item.payment_number || '',
      commission_rate: String(item.commission_rate || 0), prefix_code: item.prefix_code || '',
      ussd_code_template: item.ussd_code_template || '', provider_logo: item.provider_logo || '',
    });
    setShowAdd(true); setExpandedId(null);
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: providers.length, icon: CreditCard, color: 'bg-violet-500' },
        { label: 'Active', value: providers.filter(p => p.is_active).length, icon: CheckCircle, color: 'bg-green-500' },
      ]} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewPay({ provider_name: '', payment_mode: 'ussd', payment_number: '', commission_rate: '0', prefix_code: '', ussd_code_template: '', provider_logo: '' }); }}
        className="w-full py-2.5 bg-gradient-to-r from-violet-500 to-violet-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Payment Provider Cusub' : 'Add Payment Provider'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{editingId ? '✏️ Edit' : '➕ New'}</div>
          <input value={newPay.provider_name} onChange={e => setNewPay(p => ({...p, provider_name: e.target.value}))} placeholder="Provider Name *" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <label className="block text-sm font-medium">{isSo ? 'Habka lacag-bixinta' : 'Payment method'}
            <select value={newPay.payment_mode} onChange={e => setNewPay(p => ({ ...p, payment_mode: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm">
              <option value="ussd">{isSo ? 'Lambar / USSD' : 'Number / USSD'}</option>
              <option value="waafipay_api">WaafiPay API</option>
              <option value="edahab_api">eDahab API</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{newPay.payment_mode === 'waafipay_api' ? (isSo ? 'Lacagta waxaa lagu bixinayaa WaafiPay API-ga ku xiran dukaankan.' : 'Payments use the store’s configured WaafiPay account.') : newPay.payment_mode === 'edahab_api' ? (isSo ? 'Lacagta waxaa lagu bixinayaa eDahab API-ga ku xiran dukaankan.' : 'Payments use the store’s configured eDahab API account.') : (isSo ? 'Lambarka iyo USSD-ga hoose ayaa lacag-bixinta loo isticmaalaa.' : 'Payments use the number and USSD below.')}</p>
          <input value={newPay.payment_number} onChange={e => setNewPay(p => ({...p, payment_number: e.target.value}))} placeholder="Payment Number" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <input value={newPay.commission_rate} onChange={e => setNewPay(p => ({...p, commission_rate: e.target.value}))} placeholder="Commission %" type="number" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
            <input value={newPay.prefix_code} onChange={e => setNewPay(p => ({...p, prefix_code: e.target.value}))} placeholder="Prefix Code" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          </div>
          <input value={newPay.ussd_code_template} onChange={e => setNewPay(p => ({...p, ussd_code_template: e.target.value}))} placeholder="USSD Template" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <ImageUploader value={newPay.provider_logo} onChange={url => setNewPay(p => ({...p, provider_logo: url}))} bucket="provider-logos" label="Logo" />
          <div className="flex gap-2">
            <button onClick={savePaymentProvider} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">{editingId ? '💾 Save' : '➕ Add'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      {loading ? <LazyFallback /> : providers.length === 0 ? <EmptyState message="No payment providers" /> : (
        <div className="space-y-2">
          {providers.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <div className="w-full px-3 py-2.5 flex items-center gap-2 active:bg-purple-50/50">
                  <OrderArrows
                    onUp={() => swapOrder('payment_providers_config', providers, idx, -1, loadPaymentProviders)}
                    onDown={() => swapOrder('payment_providers_config', providers, idx, 1, loadPaymentProviders)}
                    disabledUp={idx === 0} disabledDown={idx === providers.length - 1} />
                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="flex-1 flex items-center gap-3 text-left">
                    {item.provider_logo && <img src={item.provider_logo} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                    <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800 dark:text-white">{item.provider_name}</div></div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: CreditCard, label: 'Provider', value: item.provider_name, color: 'text-purple-500' },
                    { icon: CreditCard, label: isSo ? 'Habka' : 'Method', value: item.payment_mode === 'waafipay_api' ? 'WaafiPay API' : 'Lambar / USSD', color: 'text-blue-500' },
                    { icon: Phone, label: 'Payment No', value: item.payment_number || '—', color: 'text-green-500' },
                    { icon: DollarSign, label: 'Commission', value: `${item.commission_rate}%`, color: 'text-emerald-500' },
                    ...(item.prefix_code ? [{ icon: Hash, label: 'Prefix', value: item.prefix_code, color: 'text-indigo-500' }] : []),
                    ...(item.ussd_code_template ? [{ icon: Phone, label: 'USSD', value: item.ussd_code_template, color: 'text-blue-500' }] : []),
                  ]} actions={
                    <>
                      <ActionBtn onClick={() => startEdit(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />
                      <ActionBtn onClick={() => toggleProvider(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
                      <ActionBtn onClick={() => deleteProvider(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
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

// ========== SYSTEM CODES (with Edit) ==========
export const SystemCodesCustomView = ({ isSo }: { isSo: boolean }) => {
  const [instructions, setInstructions] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyCode = { provider_id: '', code_template: '', sim_password: '', notes: '', category_id: '', package_id: '', menu1: '', menu2: '', menu3: '' };
  const [newCode, setNewCode] = useState(emptyCode);

  // Ka nadiifi |A,B suffix template-ka
  const stripMenuSuffix = (t: string) => { const i = (t || '').indexOf('|'); return i < 0 ? (t || '') : t.substring(0, i); };
  const parseMenuFromTemplate = (t: string): { m1: string; m2: string; m3: string } => {
    const i = (t || '').indexOf('|');
    if (i < 0) return { m1: '', m2: '', m3: '' };
    // Keep raw text — could be digits ("1") or keywords ("Data;Xogta")
    const parts = t.substring(i + 1).split(',').map(s => s.trim());
    return { m1: parts[0] || '', m2: parts[1] || '', m3: parts[2] || '' };
  };
  const isFlow870 = (t: string) => (t || '').trim().startsWith('*870*');
  const isFlow866 = (t: string) => (t || '').trim().startsWith('*866*');
  const isFlow101 = (t: string) => (t || '').trim() === '*101#';
  const isMenuFlow = (t: string) => isFlow870(t) || isFlow866(t) || isFlow101(t);

  // Hardcoded USSD flow presets (aan qorin table, waxay ka shaqeeyaan Android app-ka)
  const USSD_PRESETS: { id: string; label: string; template: string; note: string }[] = [
    {
      id: 'flow_870',
      label: '*870* Flow (Menu1 → Xirmo → Menu2 → PIN)',
      template: '*870*{receiver_phone}#',
      note: 'Buuxi Menu 1 & Menu 2 hoos. Xirmada waxaa laga soo qaadaa package-ka la doortay, PIN-na si toos ah.',
    },
    {
      id: 'flow_866',
      label: '*866* Flow (Menu1 → Xirmo → Menu2 → PIN) — Somnet',
      template: '*866*{receiver_phone}#',
      note: 'Buuxi Menu 1 & Menu 2 hoos. Isku shaqo la *870*.',
    },
    {
      id: 'flow_101',
      label: '*101* Flow (Menu → Xirmo → Lambarka → PIN) — Somtel',
      template: '*101#',
      note: 'Buuxi Menu 1 & Menu 2 (Menu 3 waa ikhtiyaari). Lambarka helaha — waxba ha qorin: APK-gu si otomaatig ah ayuu u ogaanayaa dialog-ga "Geli lambarka" oo wuxuu qorayaa lambarka macaamiishu dalbatay. PIN-na si toos ah.',
    },
  ];
  const applyPreset = (presetId: string) => {
    const preset = USSD_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setNewCode(p => ({
      ...p,
      code_template: preset.template,
      notes: p.notes ? p.notes : preset.note,
    }));
    toast.success(isSo ? 'Preset la doortay' : 'Preset applied');
  };

  const loadCodes = useCallback(async () => {
    const [instRes, provRes, catRes, pkgRes] = await Promise.all([
      supabase.from('delivery_instructions').select('*').order('created_at', { ascending: false }),
      supabase.from('providers_config').select('id, provider_name, provider_logo').order('display_order'),
      supabase.from('package_categories').select('id, category_name, provider_id').order('display_order'),
      supabase.from('data_packages_config').select('id, package_name, provider_id').order('display_order').limit(500),
    ]);
    setInstructions(instRes.data || []);
    setProviders(provRes.data || []);
    setCategories(catRes.data || []);
    setPkgs(pkgRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);
  useRealtimeRefresh(['delivery_instructions'], loadCodes, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const getProviderName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.category_name || '—';
  const getPackageName = (id: string) => pkgs.find(p => p.id === id)?.package_name || '—';
  const filteredProvCategories = newCode.provider_id ? categories.filter(c => c.provider_id === newCode.provider_id) : categories;
  const filteredProvPackages = newCode.provider_id ? pkgs.filter(p => p.provider_id === newCode.provider_id) : pkgs;
  const filtered = providerFilter === 'all' ? instructions : instructions.filter(i => i.provider_id === providerFilter);

  const saveCode = async () => {
    if (!newCode.provider_id || !newCode.code_template) { toast.error('Fill provider and code template'); return; }
    // Isku dar menu suffix haddii ay tahay flow *870* iyo ugu yaraan hal field oo buuxa
    let finalTemplate = stripMenuSuffix(newCode.code_template.trim());
    if (isMenuFlow(finalTemplate) && (newCode.menu1 || newCode.menu2 || newCode.menu3)) {
      // Nadiifi comma (waa step separator) iyo pipe
      const clean = (s: string) => (s || '').replace(/[,|]/g, ' ').replace(/\s+/g, ' ').trim();
      const m1 = clean(newCode.menu1) || '1';
      const m2 = clean(newCode.menu2) || '1';
      const m3 = clean(newCode.menu3);
      finalTemplate = `${finalTemplate}|${m1},${m2}${m3 ? `,${m3}` : ''}`;
    }
    const ussdCheck = validateUssdTemplate(finalTemplate);
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }
    const payload = {
      provider_id: newCode.provider_id, code_template: finalTemplate, sim_password: newCode.sim_password || null,
      notes: newCode.notes || null, category_id: newCode.category_id || null, package_id: newCode.package_id || null, instruction_template: '',
    };
    if (editingId) {
      await supabase.from('delivery_instructions').update(payload).eq('id', editingId);
    } else {
      await supabase.from('delivery_instructions').insert([payload]);
    }
    const { data: fresh } = await supabase.from('delivery_instructions').select('*').order('created_at', { ascending: false });
    setInstructions(fresh || []);
    setNewCode(emptyCode);
    setShowAdd(false); setEditingId(null);
    toast.success(editingId ? 'Updated' : 'Added');
  };

  const deleteCode = async (id: string) => {
    if (!confirm('Delete this code?')) return;
    await supabase.from('delivery_instructions').delete().eq('id', id);
    setInstructions(prev => prev.filter(i => i.id !== id));
    toast.success('Deleted');
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    const raw = item.code_template || '';
    const { m1, m2, m3 } = parseMenuFromTemplate(raw);
    setNewCode({ provider_id: item.provider_id || '', code_template: stripMenuSuffix(raw), sim_password: item.sim_password || '', notes: item.notes || '', category_id: item.category_id || '', package_id: item.package_id || '', menu1: m1, menu2: m2, menu3: m3 });
    setShowAdd(true);
  };

  const groupedProviders = providers.filter(prov => filtered.some(i => i.provider_id === prov.id));
  const getLevelLabel = (item: any) => item.package_id ? '📦 Package' : item.category_id ? '📁 Category' : '🏢 Provider';

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total Codes', value: instructions.length, icon: Code, color: 'bg-purple-500' },
        { label: 'Providers', value: new Set(instructions.map(i => i.provider_id)).size, icon: Globe, color: 'bg-blue-500' },
      ]} />
      <ProviderFilterRow providers={providers} activeId={providerFilter} onSelect={setProviderFilter}
        activeColor="bg-purple-600" totalCount={instructions.length} allLabel={isSo ? 'Dhammaan' : 'All'}
        countFn={id => instructions.filter(i => i.provider_id === id).length} />
      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewCode(emptyCode); }}
        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Code Cusub' : 'Add System Code'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <div className="text-xs font-bold text-gray-600">{editingId ? '✏️ Edit' : '➕ New'}</div>
          <select value={newCode.provider_id} onChange={e => setNewCode(p => ({...p, provider_id: e.target.value, category_id: '', package_id: ''}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">Select Provider *</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          <select value={newCode.category_id} onChange={e => setNewCode(p => ({...p, category_id: e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">Category (optional)</option>
            {filteredProvCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
          </select>
          <select value={newCode.package_id} onChange={e => setNewCode(p => ({...p, package_id: e.target.value}))} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
            <option value="">Package (optional)</option>
            {filteredProvPackages.map(p => <option key={p.id} value={p.id}>{p.package_name}</option>)}
          </select>
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-2 space-y-1">
            <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
              {isSo ? '⚡ Doorasho Preset (USSD Flow Cusub)' : '⚡ Preset (New USSD Flow)'}
            </div>
            <select
              value=""
              onChange={e => { if (e.target.value) applyPreset(e.target.value); e.target.value = ''; }}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border text-sm outline-none"
            >
              <option value="">{isSo ? '— Dooro USSD flow diyaar ah —' : '— Choose a preset flow —'}</option>
              {USSD_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
              {isSo
                ? 'Flow *870*/*866*: geli LAMBAR (tusaale "1") ama KEYWORDS (tusaale "Data;Xogta"). Marka lambarada dialog-ka is-bedelaan, keyword-yada ayaa la scan gareynayaa oo lambarka sax ah ayaa la qorayaa. Isticmaal ";" si aad u kala saarto keyword badan.'
                : 'For *870*/*866* flow: enter a NUMBER (e.g. "1") or KEYWORDS (e.g. "Data;Xogta"). When menu numbers change, keywords are scanned against dialog lines to pick the right number. Use ";" to separate multiple keywords.'}
            </div>
          </div>
          <input value={newCode.code_template} onChange={e => setNewCode(p => ({...p, code_template: e.target.value}))} placeholder="e.g. *870*{receiver_phone}#" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none font-mono" />
          {isMenuFlow(newCode.code_template) && (
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{isSo ? 'Menu 1 — lambar ama keywords (tus. "Data;Xogta")' : 'Menu 1 — number or keywords (e.g. "Data;Xogta")'}</label>
                <input value={newCode.menu1} onChange={e => setNewCode(p => ({...p, menu1: e.target.value}))} placeholder='e.g. 1  or  Data;Xogta' className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{isSo ? 'Menu 2 — lambar ama keywords (tus. "Mudnaan;Unlimited")' : 'Menu 2 — number or keywords (e.g. "Mudnaan;Unlimited")'}</label>
                <input value={newCode.menu2} onChange={e => setNewCode(p => ({...p, menu2: e.target.value}))} placeholder='e.g. 1  or  Mudnaan;Unlimited' className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{isSo ? 'Menu 3 (ikhtiyaari) — lambar ama keywords. Lambarka helaha ha qorin — wuu otomaatig yahay.' : 'Menu 3 (optional) — number or keywords. Do NOT enter the receiver phone — it is automatic.'}</label>
                <input value={newCode.menu3} onChange={e => setNewCode(p => ({...p, menu3: e.target.value}))} placeholder='e.g. 2  or  Data;Baal' className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none font-mono" />
              </div>
            </div>
          )}
          <input value={newCode.sim_password} onChange={e => setNewCode(p => ({...p, sim_password: e.target.value}))} placeholder="SIM Password (optional)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <input value={newCode.notes} onChange={e => setNewCode(p => ({...p, notes: e.target.value}))} placeholder="Notes (optional)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <div className="flex gap-2">
            <button onClick={saveCode} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">{editingId ? '💾 Save' : '➕ Add'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setShowAdd(false); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">Cancel</button>}
          </div>
        </div>
      )}
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message="No system codes found" /> : (
        <div className="space-y-3">
          {providerFilter === 'all' ? groupedProviders.map(prov => {
            const provCodes = filtered.filter(i => i.provider_id === prov.id);
            return (
              <div key={prov.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {prov.provider_logo && <img src={prov.provider_logo} alt="" className="w-7 h-7 rounded-full object-cover" />}
                  <span className="font-bold text-sm text-gray-700 dark:text-gray-200">{prov.provider_name}</span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">{provCodes.length}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">{provCodes.map(item => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                      <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-gray-800 dark:text-white font-mono truncate">{item.code_template || item.ussd_code || '—'}</div>
                          <div className="text-[11px] text-gray-400">{getLevelLabel(item)} {item.package_id ? `· ${getPackageName(item.package_id)}` : item.category_id ? `· ${getCategoryName(item.category_id)}` : ''}</div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                          { icon: Code, label: 'Code', value: item.code_template || '—', color: 'text-purple-500' },
                          { icon: Globe, label: 'Provider', value: getProviderName(item.provider_id), color: 'text-indigo-500' },
                          ...(item.category_id ? [{ icon: Package, label: 'Category', value: getCategoryName(item.category_id), color: 'text-emerald-500' }] : []),
                          ...(item.package_id ? [{ icon: Package, label: 'Package', value: getPackageName(item.package_id), color: 'text-cyan-500' }] : []),
                          ...(item.sim_password ? [{ icon: Hash, label: 'SIM Pass', value: item.sim_password, color: 'text-red-500' }] : []),
                          { icon: Hash, label: 'Level', value: getLevelLabel(item), color: 'text-amber-500' },
                          ...(item.notes ? [{ icon: FileText, label: 'Notes', value: item.notes, color: 'text-gray-500' }] : []),
                        ]} actions={
                          <>
                            <ActionBtn onClick={() => startEdit(item)} icon={Pencil} label={isSo ? 'Beddel' : 'Edit'} />
                            <ActionBtn onClick={() => deleteCode(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
                          </>
                        } />
                      )}
                    </div>
                  );
                })}</div>
              </div>
            );
          }) : (
            <div className="space-y-2">{filtered.map(item => {
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden">
                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left">
                    <div className="font-bold text-sm font-mono truncate flex-1">{item.code_template || '—'}</div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                      { icon: Code, label: 'Code', value: item.code_template || '—', color: 'text-purple-500' },
                      ...(item.sim_password ? [{ icon: Hash, label: 'SIM Pass', value: item.sim_password, color: 'text-red-500' }] : []),
                    ]} actions={
                      <>
                        <ActionBtn onClick={() => startEdit(item)} icon={Pencil} label="Edit" />
                        <ActionBtn onClick={() => deleteCode(item.id)} icon={Trash2} label="Delete" variant="danger" />
                      </>
                    } />
                  )}
                </div>
              );
            })}</div>
          )}
        </div>
      )}
    </div>
  );
};

