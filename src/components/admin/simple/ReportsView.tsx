// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const money = (v: any) => `$${Number(v || 0).toFixed(2)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

const rangeFor = (p: Preset): { from: string; to: string } => {
  const now = new Date();
  const today = toISODate(now);
  if (p === 'today') return { from: today, to: today };
  if (p === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: toISODate(y), to: toISODate(y) };
  }
  if (p === '7d') {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { from: toISODate(s), to: today };
  }
  if (p === '30d') {
    const s = new Date(now); s.setDate(s.getDate() - 29);
    return { from: toISODate(s), to: today };
  }
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toISODate(s), to: today };
};

const Card = ({ label, value, sub, tone = 'default' }: any) => {
  const tones: Record<string, string> = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-50 mt-0.5">{value}</p>
      {sub ? <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p> : null}
    </div>
  );
};

const Table = ({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
    </div>
    {/* Mobile: stacked cards */}
    <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-center text-gray-400 text-xs">—</div>
      ) : rows.map((r, i) => (
        <div key={i} className="px-3 py-2 space-y-1">
          {r.map((c, j) => (
            <div key={j} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-baseline">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{head[j]}</span>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-100 text-right break-all">{c}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
    {/* Desktop: table */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
          <tr>{head.map((h) => <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-3 py-4 text-center text-gray-400">—</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
              {r.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const ReportsView = ({ isSo }: { isSo: boolean }) => {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(rangeFor('today').from);
  const [to, setTo] = useState(rangeFor('today').to);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async (f = from, t = to) => {
    setLoading(true);
    const { data: res, error } = await (supabase as any).rpc('get_admin_reports', {
      p_start: new Date(`${f}T00:00:00`).toISOString(),
      p_end: new Date(`${t}T23:59:59.999`).toISOString(),
    });
    if (error) toast.error(isSo ? 'Xogta lama soo helin' : 'Failed to load report');
    else setData(res);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;
    const r = rangeFor(p);
    setFrom(r.from); setTo(r.to);
    load(r.from, r.to);
  };

  const presets: { key: Preset; label: string; labelSo: string }[] = [
    { key: 'today', label: 'Today', labelSo: 'Maanta' },
    { key: 'yesterday', label: 'Yesterday', labelSo: 'Shalay' },
    { key: '7d', label: '7 Days', labelSo: '7 Maalmood' },
    { key: '30d', label: '30 Days', labelSo: '30 Maalmood' },
    { key: 'month', label: 'This Month', labelSo: 'Bishan' },
  ];

  const received = Number(data?.received || 0);
  const cost = Number(data?.cost || 0);
  const commission = Number(data?.commission || 0);
  const revenue = received + commission;
  const profit = revenue - cost;
  const total = Number(data?.total_orders || 0);
  const success = Number(data?.successful || 0);
  const rate = total ? ((success / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border ${
              preset === p.key
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
            }`}
          >
            {isSo ? p.labelSo : p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] text-gray-500">{isSo ? 'Laga bilaabo' : 'From'}</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} className="h-9 text-xs" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] text-gray-500">{isSo ? 'Ilaa' : 'To'}</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} className="h-9 text-xs" />
        </div>
        <Button onClick={() => load()} className="h-9 bg-green-600 hover:bg-green-700 text-white text-xs">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {isSo ? 'Fiiri' : 'Apply'}
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Card label={isSo ? 'Dalabyo Guulaystay' : 'Successful Transactions'} value={success} sub={`${isSo ? 'wadar' : 'of'} ${total}`} tone="blue" />
            <Card label={isSo ? 'Lacag La Helay' : 'Received from Customers'} value={money(received)} tone="green" />
            <Card label={isSo ? 'Kharashka Shirkadaha' : 'Cost (Paid to Telecom)'} value={money(cost)} tone="red" />
            <Card label={isSo ? 'Komishan' : 'Commission Earned'} value={money(commission)} tone="amber" />
            <Card label={isSo ? 'Wadarta Dakhliga' : 'Total Revenue'} value={money(revenue)} sub={isSo ? 'La helay + Komishan' : 'Received + Commission'} tone="green" />
            <Card label={isSo ? 'Faa\u2019iido' : 'Profit'} value={money(profit)} sub={isSo ? 'Dakhli \u2212 Kharash' : 'Revenue \u2212 Cost'} tone={profit >= 0 ? 'green' : 'red'} />
            <Card label={isSo ? 'Heerka Guusha' : 'Success Rate'} value={`${rate}%`} />
            <Card label={isSo ? 'La diray / La ansixiyay' : 'Sent / Approved'} value={`${data?.sent || 0} / ${data?.approved || 0}`} />
          </div>

          <Table
            title={isSo ? 'Iibka Shirkad Kasta' : 'Sales by Company'}
            head={[isSo ? 'Shirkad' : 'Company', '#', isSo ? 'La helay' : 'Received', isSo ? 'Kharash' : 'Cost', isSo ? 'Komishan' : 'Commission']}
            rows={(data?.by_company || []).map((r: any) => [r.name, r.count, money(r.received), money(r.cost), money(r.commission)])}
          />

          <Table
            title={isSo ? 'Xaaladda Dalabyada' : 'Sales by Status'}
            head={[isSo ? 'Xaalad' : 'Status', '#', isSo ? 'Lacag' : 'Amount']}
            rows={(data?.by_status || []).map((r: any) => [r.status, r.count, money(r.amount)])}
          />

          <Table
            title={isSo ? 'Macaamiisha Ugu Badan' : 'Top Customers'}
            head={['#', isSo ? 'Lambar' : 'Phone', isSo ? 'Dalabyo' : 'Orders', isSo ? 'Wadar' : 'Total Spent']}
            rows={(data?.top_customers || []).map((r: any, i: number) => [i + 1, r.phone, r.orders, money(r.total)])}
          />

          <Table
            title={isSo ? 'Xirmooyinka Ugu Badan' : 'Top Packages'}
            head={[isSo ? 'Xirmo' : 'Package', isSo ? 'Qiime' : 'Price', isSo ? 'Kharash' : 'Cost', isSo ? 'La iibiyay' : 'Sold']}
            rows={(data?.top_packages || []).map((r: any) => [r.name, money(r.price), money(r.cost), r.sold])}
          />

          <Table
            title={isSo ? 'Habka Lacag Bixinta' : 'Payment Methods'}
            head={[isSo ? 'Hab' : 'Method', '#', isSo ? 'Lacag' : 'Amount']}
            rows={(data?.payment_methods || []).map((r: any) => [r.method, r.count, money(r.amount)])}
          />

          <Table
            title={isSo ? 'Shaqaalaha' : 'Employee Performance'}
            head={[isSo ? 'Shaqaale' : 'Employee', isSo ? 'Ficillo' : 'Actions', isSo ? 'La diray' : 'Sent', isSo ? 'La joojiyay' : 'Cancelled']}
            rows={(data?.staff || []).map((r: any) => [r.email, r.actions, r.sent, r.cancelled])}
          />
        </>
      )}
    </div>
  );
};

export default ReportsView;