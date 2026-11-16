import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { sendManualSomlink } from '@/lib/somlink.functions';

interface Pkg {
  id: string;
  package_name: string;
  category_id: string | null;
  data_amount: string | null;
  selling_price: number;
  cost_price: number;
  somlink_bundle_id: number | null;
}

export function SomlinkManualView({ isSo, embedded = false, onSuccess }: { isSo: boolean; embedded?: boolean; onSuccess?: () => void }) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [categories, setCategories] = useState<{ id: string; category_name: string }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [loadError, setLoadError] = useState('');
  const sendingLock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [packageId, setPackageId] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendManualSomlink);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: providers, error: providerError } = await supabase
          .from('providers_config').select('id,provider_name,is_active');
        if (providerError) throw providerError;
        const somlinkProviderIds = (providers || [])
          .filter(p => p.provider_name.trim().toLowerCase() === 'somlink' && p.is_active !== false)
          .map(p => p.id);
        if (!somlinkProviderIds.length) return;
        const [pkgResult, catResult] = await Promise.all([
          supabase.from('data_packages_config')
            .select('id,category_id,package_name,data_amount,selling_price,cost_price,somlink_bundle_id')
            .in('provider_id', somlinkProviderIds).not('somlink_bundle_id', 'is', null)
            .eq('is_active', true).eq('is_discovery_root', false)
            .gt('cost_price', 0).gt('selling_price', 0.01)
            .order('display_order', { ascending: true }).limit(500),
          supabase.from('package_categories').select('id,category_name')
            .in('provider_id', somlinkProviderIds).eq('is_active', true)
            .order('display_order', { ascending: true }).limit(500),
        ]);
        if (pkgResult.error) throw pkgResult.error;
        if (catResult.error) throw catResult.error;
        if (!active) return;
        const list = (pkgResult.data || []) as Pkg[];
        const used = new Set(list.map(p => p.category_id).filter(Boolean));
        setPackages(list);
        setCategories((catResult.data || []).filter(category => used.has(category.id)));
      } catch (error: any) {
        if (active) setLoadError(error?.message || 'Somlink catalog could not be loaded');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filteredPackages = packages.filter(p => p.category_id === categoryId);
  const selected = filteredPackages.find(p => p.id === packageId);
  const receiver = phone.replace(/\D/g, '').replace(/^252/, '');
  const validReceiver = /^64\d{7}$/.test(receiver);

  const handleSend = async () => {
    if (sendingLock.current || sending) return;
    if (!categoryId || !selected) {
      toast.error(isSo ? 'Marka hore category iyo xirmo dooro' : 'Choose category and bundle');
      return;
    }
    if (!validReceiver) {
      toast.error(isSo ? 'Lambar Somlink oo 64XXXXXXX ah geli' : 'Enter Somlink number 64XXXXXXX');
      return;
    }
    const cost = Number(selected.cost_price);
    if (!Number.isFinite(cost) || cost <= 0) return;
    const prompt = (isSo ? 'U dir ' : 'Send ') + selected.package_name + ' → ' + receiver +
      '? Somlink wallet-ka waxaa laga jarayaa $' + cost.toFixed(2) +
      '. Lacagta macaamiilka laguma xaqiijinayo.';
    if (!window.confirm(prompt)) return;
    sendingLock.current = true;
    setSending(true);
    try {
      const res: any = await send({ data: { packageId: selected.id, receiverPhone: receiver, note } });
      if (res?.success) {
        toast.success(isSo ? 'Somlink: xirmadii si guul leh ayaa loo diray.' : 'Somlink bundle delivered.');
        setPhone(''); setNote(''); setCategoryId(''); setPackageId('');
        onSuccess?.();
      } else {
        toast.error(res?.message || (isSo ? 'Diristu way fashilantay. Hubi Dalabyada.' : 'Delivery failed. Check Orders.'));
      }
    } catch (error: any) {
      // A network failure may occur after provider payment: do not auto-retry.
      toast.error((error?.message || 'Somlink request not confirmed') +
        (isSo ? ' — Ka hubi Dalabyada kahor isku-day kale.' : ' — Check Orders before retrying.'));
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  };

  return (
    <div className={embedded ? "space-y-3" : "p-4 space-y-4"}>
      <div className={embedded ? "space-y-3" : "bg-white dark:bg-gray-800 rounded-xl shadow p-4 space-y-4"}>
        {!embedded && (
          <>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-600" />
              <h2 className="font-bold text-gray-900 dark:text-white">
                {isSo ? 'Somlink — Dalab Manual ah' : 'Somlink — Manual Send'}
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              {isSo ? 'Dooro category, kadib xirmada iyo lambar 64XXXXXXX.' : 'Choose category, bundle and 64XXXXXXX recipient.'}
            </p>
          </>
        )}

        <div className="space-y-1">
          <label htmlFor="somlink-manual-category" className="text-sm font-medium">Category</label>
          <select id="somlink-manual-category" value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setPackageId(''); }}
            disabled={loading || !!loadError || sending}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-background px-3 py-2 text-sm">
            <option value="">{loading ? 'Loading...' : (isSo ? 'Dooro category' : 'Choose category')}</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.category_name}</option>)}
          </select>
          {loadError && <p role="alert" className="text-xs text-red-500">{loadError}</p>}
          {!loading && !loadError && categories.length === 0 && (
            <p className="text-xs text-gray-500">{isSo ? 'Xirmo Somlink ah lama helin.' : 'No eligible Somlink bundles.'}</p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="somlink-manual-package" className="text-sm font-medium">{isSo ? 'Xirmada' : 'Bundle'}</label>
          <select id="somlink-manual-package" value={packageId} onChange={e => setPackageId(e.target.value)}
            disabled={!categoryId || sending || loading || !!loadError}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-background px-3 py-2 text-sm">
            <option value="">{categoryId ? (isSo ? 'Dooro xirmada' : 'Choose bundle') : (isSo ? 'Marka hore dooro category' : 'Select category first')}</option>
            {filteredPackages.map(pkg => <option key={pkg.id} value={pkg.id}>
              {pkg.package_name + ' (' + (pkg.data_amount || '—') + ') — $' + Number(pkg.cost_price).toFixed(2)}
            </option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="somlink-manual-recipient" className="text-sm font-medium">{isSo ? 'Lambarka helaya' : 'Receiver phone'} · 64XXXXXXX</label>
          <input id="somlink-manual-recipient" type="tel" maxLength={16}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="64XXXXXXX"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{isSo ? 'Xusuusin (ikhtiyaari)' : 'Note (optional)'}</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        {selected && (
          <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
            {isSo ? 'Somlink wallet-ka laga jarayo' : 'Somlink wallet charge'}: <b>${Number(selected.cost_price).toFixed(2)}</b><p className="text-xs mt-1">{isSo ? 'Lacagta macaamiilka laguma xaqiijinayo.' : 'Customer payment is not verified.'}</p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !selected || !validReceiver || !!loadError}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSo ? 'U Dir Somlink' : 'Send via Somlink'}
        </button>
      </div>
    </div>
  );
}
