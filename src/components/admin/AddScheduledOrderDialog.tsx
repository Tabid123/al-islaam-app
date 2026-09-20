import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  isSo: boolean;
}

function formatPhoneForStorage(phone: string) {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('252')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  return '252' + p;
}

function toLocalDatetimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const AddScheduledOrderDialog = ({ open, onOpenChange, onSuccess, isSo }: Props) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 30); return toLocalDatetimeValue(d);
  });
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true).order('display_order')
      .then(({ data }) => setProviders(data || []));
  }, [open]);

  useEffect(() => {
    if (!providerId) { setPackages([]); return; }
    supabase.from('data_packages_config')
      .select('id, package_name, data_amount, selling_price, cost_price')
      .eq('provider_id', providerId).eq('is_active', true).order('selling_price')
      .then(({ data }) => setPackages(data || []));
  }, [providerId]);

  useEffect(() => {
    if (!open) {
      setProviderId(''); setPackageId(''); setReceiverPhone(''); setCustomerPhone('');
      setSenderPhone(''); setNotes('');
      const d = new Date(); d.setMinutes(d.getMinutes() + 30);
      setScheduledAt(toLocalDatetimeValue(d));
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !packageId || !receiverPhone || receiverPhone.replace(/\D/g,'').length < 9) {
      toast.error(isSo ? 'Fadlan buuxi dhammaan meelaha' : 'Fill required fields'); return;
    }
    const when = new Date(scheduledAt);
    if (!when.getTime() || when <= new Date()) {
      toast.error(isSo ? 'Waqtiga waa in uu mustaqbalka ahaadaa' : 'Time must be in the future'); return;
    }
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rx = formatPhoneForStorage(receiverPhone);
      const cx = customerPhone ? formatPhoneForStorage(customerPhone) : rx;
      const sx = senderPhone ? formatPhoneForStorage(senderPhone) : null;

      const { error } = await supabase.from('orders').insert({
        provider_id: providerId,
        package_id: packageId,
        package_name: pkg.package_name,
        data_amount: pkg.data_amount,
        selling_price: pkg.selling_price,
        cost_price: pkg.cost_price,
        receiver_phone: rx,
        customer_phone: cx,
        sender_phone: sx,
        payment_number: 'MANUAL',
        status: 'completed',
        delivery_status: 'pending',
        payment_source: 'manual',
        is_manual: true,
        scheduled_for: when.toISOString(),
        delivery_notes: notes || null,
        manual_action_by: user?.id ?? null,
        manual_action_at: new Date().toISOString(),
        manual_action_note: notes || 'Scheduled by admin',
      });
      if (error) throw error;
      toast.success(isSo ? 'Dalabka waa la qorsheeyay' : 'Order scheduled');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || (isSo ? 'Khalad' : 'Failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isSo ? 'Qorshee Dalab Cusub' : 'Schedule New Order'}</DialogTitle>
          <DialogDescription>
            {isSo ? 'U qorshee macaamiil dalab la diro waqti mustaqbal ah.' : 'Schedule an order for a customer at a future time.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>{isSo ? 'Shirkada' : 'Provider'} *</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder={isSo ? 'Dooro shirkad' : 'Select provider'} /></SelectTrigger>
              <SelectContent>
                {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isSo ? 'Package' : 'Package'} *</Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!providerId}>
              <SelectTrigger><SelectValue placeholder={isSo ? 'Dooro package' : 'Select package'} /></SelectTrigger>
              <SelectContent>
                {packages.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.package_name} — ${Number(p.selling_price).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isSo ? 'Lambarka Qaataha' : 'Receiver phone'} *</Label>
            <Input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="61XXXXXXX" inputMode="tel" />
          </div>
          <div>
            <Label>{isSo ? 'Lambarka Macmiilka' : 'Customer phone'}</Label>
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder={isSo ? 'Haddii uu ka duwan yahay qaataha' : 'If different from receiver'} inputMode="tel" />
          </div>
          <div>
            <Label>{isSo ? 'Lambarka Diraha' : 'Sender phone'}</Label>
            <Input value={senderPhone} onChange={e => setSenderPhone(e.target.value)} placeholder={isSo ? 'Ikhtiyaari' : 'Optional'} inputMode="tel" />
          </div>
          <div>
            <Label>{isSo ? 'Waqtiga la qorsheeyay' : 'Scheduled time'} *</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <Label>{isSo ? 'Fiiro gaar ah' : 'Notes'}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {isSo ? 'Jooji' : 'Cancel'}
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isSo ? 'Qorshee' : 'Schedule')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};