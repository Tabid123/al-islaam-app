import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Phone, Power, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface OfflineNumber {
  id: string;
  phone_number: string;
  ussd_prefix: string | null;
  label: string | null;
  display_order: number;
  is_active: boolean;
}

const OfflinePaymentSettings = () => {
  const [rows, setRows] = useState<OfflineNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPrefix, setNewPrefix] = useState('*712*');
  const [newLabel, setNewLabel] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { phone: string; prefix: string; label: string }>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('offline_payment_numbers')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as OfflineNumber[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the legacy single-value settings in sync with the first active number
  const syncDefault = async (list: OfflineNumber[]) => {
    const first = list.find(r => r.is_active);
    if (!first) return;
    await Promise.all([
      supabase.from('app_settings').upsert(
        { setting_key: 'payment_number', text_value: first.phone_number, description: 'Offline payment number' },
        { onConflict: 'setting_key' },
      ),
      supabase.from('app_settings').upsert(
        { setting_key: 'payment_prefix', text_value: first.ussd_prefix || '', description: 'Offline payment USSD prefix' },
        { onConflict: 'setting_key' },
      ),
    ]);
  };

  const addNumber = async () => {
    const clean = newPhone.replace(/\D/g, '');
    if (clean.length < 9) { toast.error('Lambar sax ah geli'); return; }
    setSaving(true);
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.display_order), -1);
    const { error } = await supabase.from('offline_payment_numbers').insert({
      phone_number: clean,
      ussd_prefix: newPrefix.trim() || null,
      label: newLabel.trim() || null,
      display_order: maxOrder + 1,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setNewPhone(''); setNewLabel('');
    toast.success('Lambarka waa lagu daray');
    load();
  };

  const saveRow = async (row: OfflineNumber) => {
    const d = drafts[row.id];
    if (!d) return;
    const clean = d.phone.replace(/\D/g, '');
    if (clean.length < 9) { toast.error('Lambar sax ah geli'); return; }
    const { error } = await supabase
      .from('offline_payment_numbers')
      .update({ phone_number: clean, ussd_prefix: d.prefix.trim() || null, label: d.label.trim() || null })
      .eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setDrafts(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    toast.success('Waa la kaydiyay');
    const updated = rows.map(r => r.id === row.id ? { ...r, phone_number: clean, ussd_prefix: d.prefix, label: d.label } : r);
    setRows(updated);
    syncDefault(updated);
  };

  const toggleActive = async (row: OfflineNumber) => {
    const { error } = await supabase.from('offline_payment_numbers').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    const updated = rows.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r);
    setRows(updated);
    syncDefault(updated);
  };

  const removeRow = async (row: OfflineNumber) => {
    if (!confirm(`Ma tirtiraysaa ${row.phone_number}?`)) return;
    const { error } = await supabase.from('offline_payment_numbers').delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    const updated = rows.filter(r => r.id !== row.id);
    setRows(updated);
    syncDefault(updated);
    toast.success('Waa la tirtiray');
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    const ao = a.display_order;
    const bo = b.display_order === a.display_order ? a.display_order + dir : b.display_order;
    await Promise.all([
      supabase.from('offline_payment_numbers').update({ display_order: bo }).eq('id', a.id),
      supabase.from('offline_payment_numbers').update({ display_order: ao }).eq('id', b.id),
    ]);
    load();
  };

  const getDraft = (row: OfflineNumber) =>
    drafts[row.id] || { phone: row.phone_number, prefix: row.ussd_prefix || '', label: row.label || '' };

  const setDraft = (row: OfflineNumber, patch: Partial<{ phone: string; prefix: string; label: string }>) =>
    setDrafts(prev => ({ ...prev, [row.id]: { ...getDraft(row), ...patch } }));

  if (loading) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Offline Payment Settings</h2>
        <p className="text-muted-foreground">
          Halkan waxaad ku dari kartaa lambaro badan oo lacageed. Kii ugu horreeya ee firfircoon ayaa
          si toos ah loo isticmaalayaa offline mode.
        </p>
      </div>

      {/* Add new */}
      <Card className="p-4 space-y-3">
        <p className="font-semibold text-sm">Ku dar lambar cusub</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Lambarka lacagta</Label>
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="617195659" type="tel" />
          </div>
          <div>
            <Label className="text-xs">Prefix-ka USSD</Label>
            <Input value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} placeholder="*712*" />
          </div>
          <div>
            <Label className="text-xs">Magac (ikhtiyaari)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="EVC Plus" />
          </div>
        </div>
        <Button onClick={addNumber} disabled={saving || !newPhone.trim()}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Ku dar
        </Button>
      </Card>

      {/* List */}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">Wali lambar lama darin</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const d = getDraft(row);
            const dirty = d.phone !== row.phone_number || d.prefix !== (row.ussd_prefix || '') || d.label !== (row.label || '');
            return (
              <Card key={row.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono font-bold">+252 {row.phone_number}</span>
                    <Badge variant={row.is_active ? 'default' : 'secondary'}>{row.is_active ? 'Active' : 'Off'}</Badge>
                    {i === 0 && row.is_active && <Badge variant="outline">Default</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="w-4 h-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => move(i, 1)} disabled={i === rows.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => toggleActive(row)}><Power className="w-4 h-4" /></Button>
                    <Button size="icon" variant="destructive" onClick={() => removeRow(row)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Lambarka</Label>
                    <Input value={d.phone} onChange={(e) => setDraft(row, { phone: e.target.value })} type="tel" />
                  </div>
                  <div>
                    <Label className="text-xs">Prefix</Label>
                    <Input value={d.prefix} onChange={(e) => setDraft(row, { prefix: e.target.value })} placeholder="*712*" />
                  </div>
                  <div>
                    <Label className="text-xs">Magac</Label>
                    <Input value={d.label} onChange={(e) => setDraft(row, { label: e.target.value })} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    USSD tusaale ($5):{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {(d.prefix || '')}{d.phone}*5#
                    </span>
                  </p>
                  <Button size="sm" onClick={() => saveRow(row)} disabled={!dirty}>
                    <Save className="w-4 h-4 mr-2" /> Kaydi
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OfflinePaymentSettings;
