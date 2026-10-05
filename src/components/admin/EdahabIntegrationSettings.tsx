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
  agent_code: string | null;
  merchant_phone: string | null;
  is_active: boolean;
  has_api_key: boolean;
  has_api_secret: boolean;
};

const EMPTY: Status = {
  configured:false, agent_code:null, merchant_phone:null,
  is_active:false, has_api_key:false, has_api_secret:false,
};

export default function EdahabIntegrationSettings() {
  const [status,setStatus]=useState<Status>(EMPTY);
  const [agentCode,setAgentCode]=useState('');
  const [merchantPhone,setMerchantPhone]=useState('');
  const [apiKey,setApiKey]=useState('');
  const [apiSecret,setApiSecret]=useState('');
  const [isActive,setIsActive]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);

  const apply=useCallback((next:Partial<Status>|null|undefined)=>{
    const s={...EMPTY,...(next||{})} as Status;
    setStatus(s);
    setAgentCode(s.agent_code||'');
    setMerchantPhone(s.merchant_phone||'');
    setIsActive(s.is_active===true);
    setApiKey('');
    setApiSecret('');
  },[]);

  const call=useCallback(async(payload:Record<string,unknown>)=>{
    const {data,error}=await supabase.functions.invoke('edahab-integration',{body:payload});
    if(error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error || error?.message || 'eDahab integration error');
    return data as any;
  },[]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{apply((await call({action:'status'}))?.integration);}
    catch(e:any){toast({title:'eDahab status lama soo qaadi karin',description:e?.message,variant:'destructive'});}
    finally{setLoading(false);}
  },[apply,call]);

  useEffect(()=>{void load();},[load]);

  const save=async()=>{
    if(!agentCode.trim()||!merchantPhone.trim()) return toast({title:'Agent Code iyo Phone Number waa waajib',variant:'destructive'});
    if(!status.configured && (!apiKey.trim()||!apiSecret.trim())) return toast({title:'API Key iyo API Secret geli',variant:'destructive'});
    setSaving(true);
    try{
      const data=await call({
        action:'save',
        agent_code:agentCode.trim(),
        merchant_phone:merchantPhone.trim(),
        api_key:apiKey.trim()||undefined,
        api_secret:apiSecret.trim()||undefined,
        is_active:isActive,
      });
      apply(data?.integration);
      toast({title:'eDahab API waa la kaydiyey',description:isActive?'eDahab API hadda waa Active.':'Credentials waa kaydsan yihiin, eDahab API waa paused.'});
    }catch(e:any){
      toast({title:'Kaydintu way fashilantay',description:e?.message,variant:'destructive'});
    }finally{setSaving(false);}
  };

  const remove=async()=>{
    if(!confirm('eDahab API credentials ma tirtirnaa?')) return;
    setDeleting(true);
    try{apply((await call({action:'delete'}))?.integration);toast({title:'eDahab API credentials waa la tirtiray'});}
    catch(e:any){toast({title:'Tirtiristu way fashilantay',description:e?.message,variant:'destructive'});}
    finally{setDeleting(false);}
  };

  if(loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin"/></div>;

  return <div className="mx-auto max-w-2xl space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5"/> eDahab API</CardTitle>
        <CardDescription>Super Admin-ka ayaa Al-islaam ugu xiraya eDahab merchant API credentials-ka.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Agent Code</Label><Input value={agentCode} onChange={e=>setAgentCode(e.target.value)}/></div>
          <div><Label>Phone Number</Label><Input value={merchantPhone} onChange={e=>setMerchantPhone(e.target.value.replace(/\D/g,''))}/></div>
        </div>
        <div>
          <Label>API Key</Label>
          <Input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
            placeholder={status.has_api_key?'API Key waa kaydsan yahay — blank uga tag haddii aadan beddelayn':'eDahab API Key'}/>
        </div>
        <div>
          <Label>API Secret</Label>
          <Input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)}
            placeholder={status.has_api_secret?'API Secret waa kaydsan yahay — blank uga tag haddii aadan beddelayn':'eDahab API Secret'}/>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3.5 w-3.5"/> Key/Secret browser-ka dib looguma soo celiyo.</p>
        </div>
        <div className="flex items-center justify-between rounded-xl border p-4">
          <div><div className="font-medium">Enable eDahab API</div><div className="text-xs text-muted-foreground">Marka la shido, E-DAHAB payment method-ku API ayuu isticmaalaa.</div></div>
          <Switch checked={isActive} onCheckedChange={setIsActive}/>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Keydi</Button>
          {status.configured&&<Button variant="outline" onClick={remove} disabled={deleting}><Trash2 className="mr-2 h-4 w-4"/>Tirtir</Button>}
        </div>
      </CardContent>
    </Card>
    <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <p>API Key iyo API Secret Supabase Vault ayay ku kaydsan yihiin; app-ka iyo browser-ku ma arkaan.</p>
    </div>
  </div>;
}
