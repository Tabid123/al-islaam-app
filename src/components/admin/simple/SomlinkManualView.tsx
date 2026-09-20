import { useEffect, useState } from 'react';
import { Loader2, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { sendManualSomlink } from '@/lib/somlink.functions';

interface Pkg {
  id: string;
  package_name: string;
  data_amount: string | null;
  selling_price: number;
  somlink_bundle_id: number | null;
}

export function SomlinkManualView({ isSo }: { isSo: boolean }) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageId, setPackageId] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendManualSomlink);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('data_packages_config')
        .select('id, package_name, data_amount, selling_price, somlink_bundle_id')
        .not('somlink_bundle_id', 'is', null)
        .eq('is_active', true)
        .order('selling_price', { ascending: true });
      setPackages((data as Pkg[]) || []);
      setLoading(false);
    })();
  }, []);

  const handleSend = async () => {
    if (!packageId) { toast.error(isSo ? 'Xirmo dooro' : 'Choose a package'); return; }
    if (phone.replace(/\D/g, '').length < 9) { toast.error(isSo ? 'Lambar sax ah geli' : 'Enter a valid number'); return; }
    setSending(true);
    try {
      const res: any = await send({ data: { packageId, receiverPhone: phone, note } });
      if (res?.success) {
        toast.success(isSo ? 'Waa la diray!' : 'Sent successfully');
        setPhone(''); setNote('');
      } else {
        toast.error(res?.message || (isSo ? 'Waa fashilantay' : 'Failed'));
      }
    } catch (e: any) {
      toast.error(e?.message || (isSo ? 'Waa fashilantay' : 'Failed'));
    } finally {
      setSending(false);
    }
  };

  const selected = packages.find(p => p.id === packageId);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-600" />
          <h2 className="font-bold text-gray-900 dark:text-white">
            {isSo ? 'Somlink — Dalab Manual ah' : 'Somlink — Manual Send'}
          </h2>
        </div>
        <p className="text-sm text-gray-500">
          {isSo
            ? 'Halkan waxaad si toos ah ugu diri kartaa xirmo Somlink ah adigoon device u baahnayn.'
            : 'Send a Somlink bundle directly through the API — no Android device needed.'}
        </p>

        <div className="space-y-1">
          <label className="text-sm font-medium">{isSo ? 'Xirmada' : 'Package'}</label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> ...</div>
          ) : (
            <select
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">{isSo ? '— Dooro xirmo —' : '— Select package —'}</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.package_name} {p.data_amount ? `• ${p.data_amount}` : ''} • ${Number(p.selling_price).toFixed(2)}
                </option>
              ))}
            </select>
          )}
          {packages.length === 0 && !loading && (
            <p className="text-xs text-red-500">
              {isSo ? 'Xirmo Somlink ah lama helin (somlink_bundle_id ku dar xirmooyinka).' : 'No Somlink-enabled packages found.'}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{isSo ? 'Lambarka helaya' : 'Receiver phone'}</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="61xxxxxxx"
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
            {isSo ? 'Qiimaha' : 'Price'}: <b>${Number(selected.selling_price).toFixed(2)}</b> • Bundle ID: <b>{selected.somlink_bundle_id}</b>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSo ? 'Dir hadda' : 'Send now'}
        </button>
      </div>
    </div>
  );
}
