// @ts-nocheck
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Save, Search } from 'lucide-react';

interface Props { isSo?: boolean }

const emptyRow = { label: '', cost_price: '', selling_price: '', info_line1: '', info_line2: '' };

const DiscoveryCatalogView: React.FC<Props> = ({ isSo = true }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rootId, setRootId] = useState<string>('');
  const [newRow, setNewRow] = useState(emptyRow);
  const [edits, setEdits] = useState<Record<string, any>>({});

  const [newRoot, setNewRoot] = useState({ name: '', providerId: '', categoryId: '', label: 'Data' });
  const [newCategory, setNewCategory] = useState('Maamuus');

  const { data: providers = [] } = useQuery({
    queryKey: ['discovery-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  const providerId = newRoot.providerId || providers[0]?.id || '';

  const { data: categories = [] } = useQuery({
    queryKey: ['discovery-categories', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_categories')
        .select('id, category_name')
        .eq('provider_id', providerId)
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  // Only *212* discovery root packages
  const { data: roots = [] } = useQuery({
    queryKey: ['discovery-roots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_packages_config')
        .select('id, package_name, provider_id, category_id, is_discovery_root, is_active')
        .eq('is_discovery_root', true)
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
  });

  const activeRoot = rootId || roots[0]?.id || '';

  const createCategory = async () => {
    if (!providerId) return toast({ title: 'Dooro shirkadda', variant: 'destructive' });
    if (!newCategory.trim()) return;
    const { data, error } = await supabase
      .from('package_categories')
      .insert({ provider_id: providerId, category_name: newCategory.trim(), display_order: 0, is_active: true })
      .select('id')
      .single();
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    setNewRoot((r) => ({ ...r, providerId, categoryId: data.id }));
    qc.invalidateQueries({ queryKey: ['discovery-categories', providerId] });
    toast({ title: 'Category waa la abuuray' });
  };

  const createRoot = async () => {
    if (!providerId) return toast({ title: 'Dooro shirkadda', variant: 'destructive' });
    if (!newRoot.name.trim()) return toast({ title: 'Magaca xirmada geli', variant: 'destructive' });
    if (!newRoot.categoryId) return toast({ title: 'Dooro category-ga', variant: 'destructive' });
    const { error } = await supabase.from('data_packages_config').insert({
      package_name: newRoot.name.trim(),
      provider_id: providerId,
      category_id: newRoot.categoryId,
      connection_type_label: newRoot.label || 'Data',
      data_amount: newRoot.name.trim(),
      validity_days: '-',
      selling_price: 0,
      cost_price: 0,
      display_order: roots.length,
      is_active: true,
      is_discovery_root: true,
    });
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    setNewRoot({ name: '', providerId, categoryId: newRoot.categoryId, label: newRoot.label });
    qc.invalidateQueries({ queryKey: ['discovery-roots'] });
    toast({ title: 'Xirmada *212* waa la abuuray' });
  };

  const deleteRoot = async (id: string) => {
    const { error } = await supabase.from('data_packages_config').delete().eq('id', id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['discovery-roots'] });
  };

  const { data: catalog = [] } = useQuery({
    queryKey: ['ussd-price-catalog', activeRoot],
    enabled: !!activeRoot,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ussd_price_catalog')
        .select('*')
        .eq('root_package_id', activeRoot)
        .order('selling_price');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleRoot = async (pkg: any) => {
    const { error } = await supabase
      .from('data_packages_config')
      .update({ is_active: !pkg.is_active })
      .eq('id', pkg.id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['discovery-roots'] });
  };

  const addRow = async () => {
    if (!activeRoot) return toast({ title: 'Marka hore dooro xirmo root ah', variant: 'destructive' });
    if (!newRow.label.trim()) return toast({ title: 'Magaca xirmada geli', variant: 'destructive' });
    const { error } = await supabase.from('ussd_price_catalog').insert({
      root_package_id: activeRoot,
      label: newRow.label.trim(),
      cost_price: parseFloat(newRow.cost_price || '0'),
      selling_price: parseFloat(newRow.selling_price || '0'),
      info_line1: newRow.info_line1.trim() || null,
      info_line2: newRow.info_line2.trim() || null,
    });
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    setNewRow(emptyRow);
    qc.invalidateQueries({ queryKey: ['ussd-price-catalog', activeRoot] });
    toast({ title: 'Waa la kaydiyay' });
  };

  const saveRow = async (row: any) => {
    const patch = edits[row.id];
    if (!patch) return;
    const { error } = await supabase.from('ussd_price_catalog').update({
      label: patch.label ?? row.label,
      cost_price: parseFloat(patch.cost_price ?? row.cost_price),
      selling_price: parseFloat(patch.selling_price ?? row.selling_price),
      is_active: patch.is_active ?? row.is_active,
      info_line1: (patch.info_line1 ?? row.info_line1 ?? '') || null,
      info_line2: (patch.info_line2 ?? row.info_line2 ?? '') || null,
    }).eq('id', row.id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    setEdits((e) => { const n = { ...e }; delete n[row.id]; return n; });
    qc.invalidateQueries({ queryKey: ['ussd-price-catalog', activeRoot] });
    toast({ title: 'Waa la cusboonaysiiyay' });
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('ussd_price_catalog').delete().eq('id', id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['ussd-price-catalog', activeRoot] });
  };

  // Magacyada shirkadda ee aan catalog-ga ku jirin (qiimo la'aan)
  const { data: unmatched = [] } = useQuery({
    queryKey: ['discovery-unmatched', activeRoot],
    enabled: !!activeRoot,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discovery_unmatched_labels')
        .select('*')
        .eq('root_package_id', activeRoot)
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const useUnmatchedLabel = (row: any) => {
    setNewRow({ ...emptyRow, label: row.raw_label });
    toast({ title: 'Magaca waa la buuxiyay — qiimaha geli kadibna kaydi' });
  };

  const dismissUnmatched = async (id: string) => {
    const { error } = await supabase.from('discovery_unmatched_labels').delete().eq('id', id);
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['discovery-unmatched', activeRoot] });
  };

  return (
    <div className="space-y-4">
      {unmatched.length > 0 && (
        <Card className="p-4 space-y-3 border-destructive/40">
          <h3 className="font-semibold text-destructive">Labels aan qiimo lahayn</h3>
          <p className="text-xs text-muted-foreground">
            Magacyadan shirkaddu way soo bandhigtay laakiin catalog-ga kuma jiraan — qiimo u samee si user-ku u iibsan karo.
          </p>
          <div className="space-y-2">
            {unmatched.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between gap-2 border rounded-lg p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.raw_label}</p>
                  <p className="text-[11px] text-muted-foreground">{row.hits}x</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => useUnmatchedLabel(row)}>Qiimo u samee</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissUnmatched(row.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {/* Root packages */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" /> Xirmooyinka Baarista (*212*)
        </h3>
        <p className="text-xs text-muted-foreground">
          Halkan ka abuur xirmooyinka *212* (tusaale: Data, Kuhadal, Data iyo Kuhadal) iyo category-gooda (tusaale: Maamuus).
        </p>

        <div className="space-y-2 border rounded-lg p-3">
          <div className="space-y-1">
            <Label className="text-xs">Shirkadda</Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={providerId}
              onChange={(e) => setNewRoot({ ...newRoot, providerId: e.target.value, categoryId: '' })}
            >
              {providers.map((p: any) => (
                <option key={p.id} value={p.id}>{p.provider_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={newRoot.categoryId}
              onChange={(e) => setNewRoot({ ...newRoot, categoryId: e.target.value })}
            >
              <option value="">— Dooro category —</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <Input placeholder="Maamuus" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <Button variant="outline" onClick={createCategory}>Abuur</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Magaca xirmada</Label>
              <Input placeholder="Data" value={newRoot.name}
                onChange={(e) => setNewRoot({ ...newRoot, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input placeholder="Data" value={newRoot.label}
                onChange={(e) => setNewRoot({ ...newRoot, label: e.target.value })} />
            </div>
          </div>

          <Button className="w-full" onClick={createRoot}>
            <Plus className="w-4 h-4 mr-1" /> Ku dar xirmo *212*
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {roots.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
              <span className="text-sm">{p.package_name}</span>
              <div className="flex items-center gap-2">
                <Switch checked={!!p.is_active} onCheckedChange={() => toggleRoot(p)} />
                <Button size="sm" variant="destructive" onClick={() => deleteRoot(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          {roots.length === 0 && (
            <p className="text-sm text-muted-foreground">Wali xirmo *212* lama abuurin.</p>
          )}
        </div>
      </Card>

      {/* Catalog */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Qiimaha Xirmooyinka</h3>
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Wali xirmo baaris ah lama calaamadeyn.</p>
        ) : (
          <>
            <div className="space-y-1">
              <Label>Xirmada Root</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={activeRoot}
                onChange={(e) => setRootId(e.target.value)}
              >
                {roots.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.package_name}</option>
                ))}
              </select>
            </div>

            {/* Add new */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border rounded-lg p-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Magaca menu-ga</Label>
                <Input placeholder="Unlimited Internet" value={newRow.label}
                  onChange={(e) => setNewRow({ ...newRow, label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost</Label>
                <Input type="number" step="0.01" value={newRow.cost_price}
                  onChange={(e) => setNewRow({ ...newRow, cost_price: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sell</Label>
                <Input type="number" step="0.01" value={newRow.selling_price}
                  onChange={(e) => setNewRow({ ...newRow, selling_price: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Sadar 1 (tusaale: 20 Saac)</Label>
                <Input placeholder="20 Saac" value={newRow.info_line1}
                  onChange={(e) => setNewRow({ ...newRow, info_line1: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Sadar 2 (tusaale: Unlimited)</Label>
                <Input placeholder="Unlimited" value={newRow.info_line2}
                  onChange={(e) => setNewRow({ ...newRow, info_line2: e.target.value })} />
              </div>
              <Button onClick={addRow} className="sm:col-span-4">
                <Plus className="w-4 h-4 mr-1" /> Ku dar
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2">
              {catalog.map((row: any) => {
                const e = edits[row.id] || {};
                return (
                  <div key={row.id} className="border rounded-lg p-3 space-y-2">
                    <Input value={e.label ?? row.label}
                      onChange={(ev) => setEdits({ ...edits, [row.id]: { ...e, label: ev.target.value } })} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Cost</Label>
                        <Input type="number" step="0.01" value={e.cost_price ?? row.cost_price}
                          onChange={(ev) => setEdits({ ...edits, [row.id]: { ...e, cost_price: ev.target.value } })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Sell</Label>
                        <Input type="number" step="0.01" value={e.selling_price ?? row.selling_price}
                          onChange={(ev) => setEdits({ ...edits, [row.id]: { ...e, selling_price: ev.target.value } })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Sadar 1</Label>
                        <Input value={e.info_line1 ?? row.info_line1 ?? ''}
                          onChange={(ev) => setEdits({ ...edits, [row.id]: { ...e, info_line1: ev.target.value } })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Sadar 2</Label>
                        <Input value={e.info_line2 ?? row.info_line2 ?? ''}
                          onChange={(ev) => setEdits({ ...edits, [row.id]: { ...e, info_line2: ev.target.value } })} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch checked={(e.is_active ?? row.is_active) as boolean}
                          onCheckedChange={(v) => setEdits({ ...edits, [row.id]: { ...e, is_active: v } })} />
                        <span className="text-xs text-muted-foreground">Firfircoon</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => saveRow(row)}>
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRow(row.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {catalog.length === 0 && (
                <p className="text-sm text-muted-foreground">Wali qiimo lama galin.</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default DiscoveryCatalogView;
