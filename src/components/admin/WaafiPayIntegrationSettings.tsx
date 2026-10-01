import { useCallback, useEffect, useState } from 'react';
import { CreditCard, EyeOff, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Status = {
  configured: boolean;
  merchant_uid: string | null;
  api_user_id: string | null;
  environment: 'sandbox' | 'production';
  is_active: boolean;
  has_api_key: boolean;
  credentials_valid?: boolean;
};

const EMPTY: Status = {
  configured: false,
  merchant_uid: null,
  api_user_id: null,
  environment: 'production',
  is_active: false,
  has_api_key: false,
  credentials_valid: true,
};

export default function WaafiPayIntegrationSettings() {
  const [status, setStatus] = useState<Status>(EMPTY);
  const [merchantUid, setMerchantUid] = useState('');
  const [apiUserId, setApiUserId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'sandbox'|'production'>('production');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const apply = useCallback((next: Partial<Status> | null | undefined) => {
    const s = { ...EMPTY, ...(next || {}) } as Status;
    setStatus(s);
    setMerchantUid(s.merchant_uid || '');
    setApiUserId(s.api_user_id || '');
    setEnvironment(s.environment || 'production');
    setIsActive(s.is_active === true);
    setApiKey('');
  }, []);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('waafipay-integration', { body: payload });
    if (error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error || error?.message || 'WaafiPay integration error');
    return data as any;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { apply((await call({ action: 'status' }))?.integration); }
    catch (e:any) { toast({ title:'WaafiPay status lama soo qaadi karin', description:e?.message, variant:'destructive' }); }
    finally { setLoading(false); }
  }, [apply, call]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!merchantUid.trim() || !apiUserId.trim()) return toast({ title:'Merchant UID iyo API User ID waa waajib', variant:'destructive' });
    if (!status.configured && !apiKey.trim()) return toast({ title:'API Key geli', variant:'destructive' });
    setSaving(true);
    try {
      const data = await call({
        action:'save',
        merchant_uid: merchantUid.trim(),
        api_user_id: apiUserId.trim(),
        api_key: apiKey.trim() || undefined,
        environment,
        is_active: isActive,
      });
      apply(data?.integration);
      toast({ title:'WaafiPay waa la kaydiyey', description:isActive ? 'WaafiPay hadda waa Active.' : 'Credentials waa kaydsan yihiin, WaafiPay waa paused.' });
    } catch(e:any) {
      toast({ title:'Kaydintu way fashilantay', description:e?.message, variant:'destructive' });
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('WaafiPay credentials ma tirtirnaa?')) return;
    setDeleting(true);
    try { apply((await call({ action:'delete' }))?.integration); toast({ title:'WaafiPay credentials waa la tirtiray' }); }
    catch(e:any) { toast({ title:'Tirtiristu way fashilantay', description:e?.message, variant:'destructive' }); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return <div className="mx-auto max-w-2xl space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5"/> WaafiPay API</CardTitle>
        <CardDescription>Super Admin-ka ayaa Al-islaam ugu xiraya WaafiPay merchant credentials-ka.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Merchant UID</Label><Input value={merchantUid} onChange={e=>setMerchantUid(e.target.value)} /></div>
          <div><Label>API User ID</Label><Input value={apiUserId} onChange={e=>setApiUserId(e.target.value)} /></div>
        </div>
        <div>
          <Label>API Key</Label>
          <Input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
            placeholder={status.has_api_key ? 'API Key waa kaydsan yahay — blank uga tag haddii aadan beddelayn' : 'WaafiPay API Key'} />
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3.5 w-3.5"/> Browser-ka dib looguma soo celiyo.</p>
        </div>
        <div>
          <Label>Environment</Label>
          <select value={environment} onChange={e=>setEnvironment(e.target.value as any)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="production">Production</option>
            <option value="sandbox">Sandbox</option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded-xl border p-4">
          <div><div className="font-medium">Enable WaafiPay</div><div className="text-xs text-muted-foreground">Marka la shido, WaafiPay payment method-ka app-ka wuu active noqonayaa.</div></div>
          <Switch checked={isActive} onCheckedChange={setIsActive}/>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Keydi</Button>
          {status.configured && <Button variant="outline" onClick={remove} disabled={deleting}><Trash2 className="mr-2 h-4 w-4"/>Tirtir</Button>}
        </div>
      </CardContent>
    </Card>
    <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <p>API Key-ga Supabase Vault ayuu ku kaydsan yahay. Admin-ka caadiga ah ma beddeli karo; Super Admin oo keliya ayaa geli kara.</p>
    </div>
  </div>;
}
