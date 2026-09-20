import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, RotateCcw, Search, Trash2, Users, DollarSign, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDate } from './shared';

interface Row {
  id: string;
  phone: string;
  code: string;
  earnings: number;
  total_referrals: number;
  created_at: string;
}
interface Redemption {
  id: string;
  referrer_phone: string;
  referred_phone: string;
  code_used: string;
  amount_awarded: number;
  created_at: string;
}

const money = (v: number | string) => `$${Number(v || 0).toFixed(2)}`;

export const ReferralsView = ({ isSo }: { isSo: boolean }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [reds, setReds] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'codes' | 'redemptions'>('codes');
  const [newPhone, setNewPhone] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('admin_referral_overview');
    if (error) {
      toast.error(isSo ? 'Xogta lama soo helin' : 'Failed to load');
    } else {
      setRows(data?.codes || []);
      setReds(data?.redemptions || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!newPhone.trim()) return;
    setCreating(true);
    const { data, error } = await (supabase as any).rpc('admin_create_referral_code', {
      p_phone: newPhone.trim(),
      p_code: newCode.trim() || null,
    });
    setCreating(false);
    if (error || !data?.success) {
      toast.error(data?.message || (isSo ? 'Ma shaqeyn' : 'Failed'));
      return;
    }
    toast.success(`${isSo ? 'Code la abuuray' : 'Code created'}: ${data.code}`);
    setNewPhone('');
    setNewCode('');
    load();
  };

  const reset = async (phone: string) => {
    if (!confirm(isSo ? 'Ma hubtaa in aad lacagta reset gareyso?' : 'Reset earnings?')) return;
    const { data, error } = await (supabase as any).rpc('admin_reset_referral_points', { p_phone: phone });
    if (error || !data?.success) return toast.error(isSo ? 'Ma shaqeyn' : 'Failed');
    toast.success(isSo ? 'Waa la reset gareeyay' : 'Reset');
    load();
  };

  const remove = async (phone: string) => {
    if (!confirm(isSo ? 'Ma hubtaa in aad code-ka tirtirto?' : 'Delete code?')) return;
    const { data, error } = await (supabase as any).rpc('admin_delete_referral_code', { p_phone: phone });
    if (error || !data?.success) return toast.error(isSo ? 'Ma shaqeyn' : 'Failed');
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
    load();
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.phone.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  const filteredReds = reds.filter(
    (r) =>
      !q ||
      r.referrer_phone.toLowerCase().includes(q) ||
      r.referred_phone.toLowerCase().includes(q) ||
      r.code_used.toLowerCase().includes(q),
  );

  const totalEarnings = rows.reduce((s, r) => s + Number(r.earnings || 0), 0);
  const totalRefs = rows.reduce((s, r) => s + (r.total_referrals || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border">
          <div className="text-[10px] text-gray-500 uppercase">Users</div>
          <div className="text-lg font-bold flex items-center gap-1"><Users className="h-4 w-4 text-indigo-500" />{rows.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border">
          <div className="text-[10px] text-gray-500 uppercase">Referrals</div>
          <div className="text-lg font-bold text-emerald-600">{totalRefs}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border">
          <div className="text-[10px] text-gray-500 uppercase">Lacag</div>
          <div className="text-lg font-bold flex items-center gap-1 text-amber-600">
            <DollarSign className="h-4 w-4" />{totalEarnings.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Admin issues a code */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border space-y-2">
        <div className="text-sm font-semibold">{isSo ? 'Code cusub sii user' : 'Issue a code to a user'}</div>
        <div className="flex gap-2">
          <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={isSo ? 'Lambarka user-ka' : 'User phone'} />
          <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder={isSo ? 'Code (ikhtiyaari)' : 'Code (optional)'} className="w-36" />
          <Button onClick={create} disabled={creating || !newPhone.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-gray-500">
          {isSo ? 'Qof kasta oo code-kan isticmaala waxaa loo qorayaa $0.05 qofka code-ka leh.' : 'Each signup with this code credits the owner $0.05.'}
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('codes')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'codes' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border text-gray-600'}`}>
          Codes ({rows.length})
        </button>
        <button onClick={() => setTab('redemptions')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'redemptions' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 border text-gray-600'}`}>
          Redemptions ({reds.length})
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isSo ? 'Raadi phone / code' : 'Search phone / code'} className="pl-9" />
      </div>

      {tab === 'codes' ? (
        <div className="space-y-2">
          {filtered.map((r) => {
            const mine = reds.filter((x) => x.referrer_phone === r.phone);
            const open = expanded === r.id;
            return (
              <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
                <div className="p-3 flex items-center justify-between">
                  <button
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="min-w-0 flex-1 text-left flex items-center gap-2"
                  >
                    <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{r.phone}</span>
                      <span className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{r.code}</span>
                        <span>· {r.total_referrals} refs</span>
                        <span>· {formatDate(r.created_at)}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-amber-600">{money(r.earnings)}</span>
                    <Button size="icon" variant="ghost" onClick={() => reset(r.phone)} title="Reset">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.phone)} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="border-t bg-gray-50 dark:bg-gray-900/40 px-3 py-2 space-y-1">
                    <div className="text-[11px] uppercase text-gray-500">
                      {isSo ? 'Lambarada uu keenay' : 'Referred numbers'} ({mine.length})
                    </div>
                    {mine.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm py-1">
                        <span className="font-medium">{m.referred_phone}</span>
                        <span className="text-xs text-gray-500">{formatDate(m.created_at)}</span>
                        <span className="text-emerald-600 font-semibold">+{money(m.amount_awarded)}</span>
                      </div>
                    ))}
                    {mine.length === 0 && (
                      <div className="text-xs text-gray-400 py-2">{isSo ? 'Weli qofna ma keenin' : 'No referrals yet'}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">No data</div>}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReds.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border">
              <div className="flex justify-between items-start">
                <div className="text-sm">
                  <div><span className="text-gray-500 text-xs">From:</span> <span className="font-semibold">{r.referred_phone}</span></div>
                  <div><span className="text-gray-500 text-xs">To:</span> <span className="font-semibold">{r.referrer_phone}</span></div>
                  <div className="text-xs text-gray-500 mt-0.5">Code: <span className="font-mono">{r.code_used}</span> · {formatDate(r.created_at)}</div>
                </div>
                <span className="text-emerald-600 font-bold">+{money(r.amount_awarded)}</span>
              </div>
            </div>
          ))}
          {filteredReds.length === 0 && <div className="text-center text-gray-400 py-8 text-sm">No data</div>}
        </div>
      )}
    </div>
  );
};
