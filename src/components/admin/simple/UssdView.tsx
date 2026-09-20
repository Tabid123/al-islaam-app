// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  done: { label: 'Dalab dhammaystiran', variant: 'default' },
  cancelled: { label: 'La joojiyay', variant: 'secondary' },
  error: { label: 'Cilad', variant: 'destructive' },
};

export function UssdView({ isSo = true }: { isSo?: boolean }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'packages' | 'sessions'>('orders');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ussd_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setOrders((data || []).filter((s: any) => s?.state?.package_id));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={tab === 'orders' ? 'default' : 'outline'} onClick={() => setTab('orders')}>Dalabyada USSD</Button>
        <Button size="sm" variant={tab === 'packages' ? 'default' : 'outline'} onClick={() => setTab('packages')}>Xirmooyinka USSD</Button>
        <Button size="sm" variant={tab === 'sessions' ? 'default' : 'outline'} onClick={() => setTab('sessions')}>Session-ada baarista</Button>
      </div>

      {tab === 'sessions' ? <DiscoverySessions /> : tab === 'packages' ? <UssdOnlyPackages /> : (
      <>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Dalabyada USSD ({orders.length})</h2>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground">Weli dalab USSD ah lama helin.</p>
          )}
          {orders.map((s) => {
            const st = STATUS[s.step] ?? { label: 'Socda', variant: 'outline' as const };
            return (
              <Card key={s.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.state?.provider_name ?? '—'}</span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>
                <p className="text-sm">{s.state?.package_name ?? '—'}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Helaya: {s.state?.receiver_phone ?? '—'}</span>
                  <span className="font-semibold">${Number(s.state?.price ?? 0).toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Diraya: {s.origin} · {new Date(s.created_at).toLocaleString()}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default UssdView;

const SESSION_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Safka ku jira', variant: 'secondary' },
  processing: { label: 'Waa la baarayaa', variant: 'default' },
  done: { label: 'Menu diyaar', variant: 'default' },
  failed: { label: 'Fashilmay', variant: 'destructive' },
};

function DiscoverySessions() {
  const [rows, setRows] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: d }, { data: dev }] = await Promise.all([
      supabase
        .from('ussd_package_discoveries')
        .select('id, phone_number, status, session_state, device_id, queued_at, claimed_at, created_at, error, selected_label')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('android_devices')
        .select('device_id, device_name, primary_for_provider, sim1_provider, sim2_provider')
        .is('archived_at', null),
    ]);
    setRows(d || []);
    setDevices(dev || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const deviceName = (id?: string | null) =>
    devices.find((x) => x.device_id === id)?.device_name || id || '—';

  const waiting = rows.filter((r) => r.status === 'pending').length;
  const active = rows.filter((r) => r.status === 'processing').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Session-ada baarista *212*</h2>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Socda</p>
          <p className="text-xl font-bold">{active}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Safka</p>
          <p className="text-xl font-bold">{waiting}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Aalado</p>
          <p className="text-xl font-bold">{devices.length}</p>
        </Card>
      </div>

      {waiting > 0 && active >= devices.length && (
        <p className="text-xs text-destructive">
          Dhammaan aaladaha way mashquul yihiin — macaamiisha safka ku jira waa la sugayaa. Aalad/SIM dheeraad ah ayaa loo baahan yahay.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Weli baaris lama sameyn.</p>}
          {rows.map((r) => {
            const st = SESSION_STATUS[r.status] ?? { label: r.status, variant: 'outline' as const };
            return (
              <Card key={r.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.phone_number}</span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aalada: {deviceName(r.device_id)} · Session: {r.session_state || '—'}
                </p>
                {r.selected_label && <p className="text-xs">Xulasho: {r.selected_label}</p>}
                {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                <p className="text-xs text-muted-foreground">
                  Safkii: {new Date(r.queued_at || r.created_at).toLocaleTimeString()}
                  {r.claimed_at ? ` · Bilaabmay: ${new Date(r.claimed_at).toLocaleTimeString()}` : ''}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EMPTY = { package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', ussd_code: '' };


function UssdOnlyPackages() {
  const [rows, setRows] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const load = async () => {
    setLoading(true);
    const [pkgRes, provRes] = await Promise.all([
      supabase.from('data_packages_config').select('*').eq('is_ussd_only', true).order('display_order'),
      supabase.from('providers_config').select('id, provider_name').order('display_order'),
    ]);
    setRows(pkgRes.data || []);
    setProviders(provRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.package_name || !form.selling_price || !form.provider_id) {
      toast.error('Buuxi magaca, qiimaha iyo shirkadda');
      return;
    }
    const payload = {
      package_name: form.package_name,
      data_amount: form.data_amount || null,
      selling_price: Number(form.selling_price),
      cost_price: Number(form.cost_price || 0),
      validity_days: form.validity_days || '30',
      provider_id: form.provider_id,
      ussd_code: form.ussd_code || null,
      connection_type_label: 'Data',
      is_ussd_only: true,
      is_active: true,
    };
    const res = editingId
      ? await supabase.from('data_packages_config').update(payload).eq('id', editingId)
      : await supabase.from('data_packages_config').insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editingId ? 'Waa la cusboonaysiiyay' : 'Waa lagu daray');
    setForm(EMPTY); setEditingId(null); setShowForm(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Ma hubtaa inaad tirtirto?')) return;
    const { error } = await supabase.from('data_packages_config').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    toast.success('Waa la tirtiray');
  };

  const toggle = async (row: any) => {
    await supabase.from('data_packages_config').update({ is_active: !row.is_active }).eq('id', row.id);
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      package_name: row.package_name || '', data_amount: row.data_amount || '',
      selling_price: String(row.selling_price ?? ''), cost_price: String(row.cost_price ?? ''),
      validity_days: row.validity_days || '30', provider_id: row.provider_id || '', ussd_code: row.ussd_code || '',
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Xirmooyinka USSD ({rows.length})</h2>
        <Button size="sm" onClick={() => { setForm(EMPTY); setEditingId(null); setShowForm(v => !v); }}>
          <Plus className="h-4 w-4 mr-1" /> Ku dar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Xirmooyinkan waxay ka muuqdaan kaliya code-ka USSD — app-ka kama muuqdaan.</p>

      {showForm && (
        <Card className="p-3 space-y-2">
          <Input placeholder="Magaca xirmada" value={form.package_name} onChange={e => setForm({ ...form, package_name: e.target.value })} />
          <Input placeholder="Xogta (tusaale 2GB)" value={form.data_amount} onChange={e => setForm({ ...form, data_amount: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Qiimaha iibka $" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} />
            <Input type="number" placeholder="Qiimaha kharashka $" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} />
          </div>
          <Input placeholder="Muddada (maalmo)" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} />
          <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.provider_id} onChange={e => setForm({ ...form, provider_id: e.target.value })}>
            <option value="">Dooro shirkadda</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
          </select>
          <Input placeholder="USSD code (ikhtiyaari)" value={form.ussd_code} onChange={e => setForm({ ...form, ussd_code: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Keydi</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY); }}>Jooji</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Weli xirmo USSD ah malahan.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <Card key={r.id} className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{r.package_name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.data_amount || '—'} · {r.validity_days}d · ${Number(r.selling_price).toFixed(2)}</div>
                </div>
                <Badge variant={r.is_active ? 'default' : 'secondary'} onClick={() => toggle(r)} className="cursor-pointer">{r.is_active ? 'On' : 'Off'}</Badge>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1" /> Wax ka bedel</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Tirtir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
