import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, UserX, Package, HelpCircle, Trash2, FilePlus, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { queueUnmatchedDelivery } from '@/lib/unmatchedDelivery';

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'all';

// Phone prefix -> provider token (fallback when a registration has no provider)
const PREFIX_PROVIDER: Record<string, string> = {
  '61': 'hormuud',
  '68': 'somnet',
  '62': 'somtel',
  '71': 'amtel',
  '64': 'somlink',
};



function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case 'today':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'week': {
      const day = d.getDay(); // 0 = Sunday
      const diff = day === 0 ? 6 : day - 1; // Monday start
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case 'year':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      return null;
  }
}

function getUnmatchedReason(payment: any): { icon: React.ReactNode; title: string; detail: string } {
  const notes = (payment.admin_notes || '').toLowerCase();

  if (notes.includes('amount mismatch')) {
    const extractField = (field: string) => {
      const regex = new RegExp(`${field}:\\s*([^|]+)`, 'i');
      const match = (payment.admin_notes || '').match(regex);
      return match ? match[1].trim() : null;
    };
    const paid = extractField('Paid') || `$${payment.amount}`;
    const expected = extractField('Expected');
    const intendedPackage = extractField('Intended Package');
    const receiver = extractField('Receiver entered');
    const provider = extractField('Provider');

    const detailParts = [`Lacag la bixiyay: ${paid}`];
    if (expected) detailParts.push(`La filayay: ${expected}`);
    if (intendedPackage) detailParts.push(`Xirmo: ${intendedPackage}`);
    if (provider) detailParts.push(`Provider: ${provider}`);
    if (receiver) detailParts.push(`Receiver: ${receiver}`);

    return {
      icon: <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />,
      title: '⚠️ Lacagtu kama ekayn dalabka (Fraud Check)',
      detail: detailParts.join(' | '),
    };
  }

  if (notes.includes('no offline registration')) {
    return {
      icon: <UserX className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      title: 'Lambarkaan system-ka kuma jiro',
      detail: `Lambarka ${payment.sender_phone} ma jiro system-ka. Macmiilku wuu u baahan yahay inuu marka hore isdiiwaangeliyo.`,
    };
  }

  if (notes.includes('no package found') || notes.includes('no package for')) {
    const crossMatch = notes.match(/waa xirmo (.+?) ah \((.+?)\)/);
    if (crossMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: 'Provider-ka qaldan ayuu ku isdiiwaangeliyay',
        detail: `$${payment.amount} - waa xirmo ${crossMatch[1]} ah (${crossMatch[2]}), laakiin macmiilku wuxuu isdiiwaangeliyay provider kale.`,
      };
    }
    const packageMatch = (payment.admin_notes || '').match(/No package for \$?([\d.]+) on (\w+)/i);
    if (packageMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: `Ma jiro xirmo $${packageMatch[1]} - ${packageMatch[2]}`,
        detail: `$${payment.amount} - ${packageMatch[2]} xirmo qiimahaan la iibiyo ma jiro. SIM: ${payment.receiver_sim || 'N/A'}`,
      };
    }
    return {
      icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
      title: 'Ma jiro xirmo qiimahaan la iibiyo',
      detail: `$${payment.amount} - ma jiro xirmo qiimahaan ah oo active ah.`,
    };
  }

  return {
    icon: <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />,
    title: 'Sabab la garaneyn',
    detail: payment.admin_notes || `Dalab la mid ah lama helin lambarka ${payment.sender_phone}`,
  };
}

const UnmatchedPayments = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerTarget, setRegisterTarget] = useState<any | null>(null);
  const [regForm, setRegForm] = useState({ sender_phone: '', receiver_phone: '', provider_name: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [providersList, setProvidersList] = useState<Array<{ id: string; provider_name: string }>>([]);
  // Package picker dialog for "Dib u dir"
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<any | null>(null);
  const [pickerProviderId, setPickerProviderId] = useState<string>('');
  const [pickerPackages, setPickerPackages] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelectedPkgId, setPickerSelectedPkgId] = useState<string>('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [pickerCategories, setPickerCategories] = useState<any[]>([]);
  const [pickerCategoryId, setPickerCategoryId] = useState<string>('all');
  const [pickerReceiver, setPickerReceiver] = useState('');

  const visiblePickerPackages = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();

    return pickerPackages.filter((pkg) => {
      const matchesCategory = pickerCategoryId === 'all' || pkg.category_id === pickerCategoryId;
      const matchesSearch = !query || [pkg.package_name, pkg.data_amount, pkg.selling_price]
        .some((value) => String(value ?? '').toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [pickerPackages, pickerCategoryId, pickerSearch]);

  // Success confirmation
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ pkg: string; price: any; provider: string; receiver: string } | null>(null);
  // Device SIM map (which delivery device received the payment SMS)
  const [deviceSims, setDeviceSims] = useState<Record<string, string>>({});
  // Auto retry confirmation
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoTarget, setAutoTarget] = useState<any | null>(null);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  // Approve dialog
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [approveReason, setApproveReason] = useState('');
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => setProvidersList(data || []));
    supabase.from('android_devices').select('device_name, sim_number, sim2_number')
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data || []).forEach((d: any) => {
          if (d.sim_number) map[String(d.sim_number)] = d.device_name;
          if (d.sim2_number) map[String(d.sim2_number)] = d.device_name;
        });
        setDeviceSims(map);
      });
  }, []);


  // Load packages when picker provider changes
  useEffect(() => {
    if (!pickerOpen || !pickerProviderId) { setPickerPackages([]); return; }
    setPickerLoading(true);
    supabase.from('data_packages_config')
      .select('id, package_name, data_amount, selling_price, validity_days, provider_id, category_id')
      .eq('provider_id', pickerProviderId)
      .eq('is_active', true)
      .order('selling_price', { ascending: true })
      .then(({ data }) => {
        setPickerPackages(data || []);
        setPickerLoading(false);
      });
    supabase.from('package_categories')
      .select('id, category_name, provider_id')
      .eq('provider_id', pickerProviderId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => setPickerCategories(data || []));
  }, [pickerOpen, pickerProviderId]);



  useEffect(() => {
    const fetchUnmatched = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('status', 'unmatched')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUnmatchedPayments(data || []);
      } catch (error) {
        console.error('Error fetching unmatched payments:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUnmatched();

    const channel = supabase
      .channel('unmatched-payments-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const newRow = payload.new as any;
        if (newRow.status === 'unmatched') setUnmatchedPayments((prev) => [newRow, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === 'unmatched') {
          setUnmatchedPayments((prev) => {
            const exists = prev.find((p) => p.id === updated.id);
            if (exists) return prev.map((p) => (p.id === updated.id ? updated : p));
            return [updated, ...prev];
          });
        } else {
          setUnmatchedPayments((prev) => prev.filter((p) => p.id !== updated.id));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const old = payload.old as any;
        setUnmatchedPayments((prev) => prev.filter((p) => p.id !== old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredPayments = useMemo(() => {
    const start = getPeriodStart(period);
    if (!start) return unmatchedPayments;
    return unmatchedPayments.filter((p) => new Date(p.created_at) >= start);
  }, [unmatchedPayments, period]);

  const allSelected = filteredPayments.length > 0 && filteredPayments.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPayments.map((p) => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('payment_receipts').delete().in('id', ids);
      if (error) throw error;
      setUnmatchedPayments((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      toast({ title: 'La tirtiray', description: `${ids.length} qoraal ayaa la tirtiray.` });
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const openRegister = (payment: any) => {
    setRegisterTarget(payment);
    setRegForm({
      sender_phone: payment.sender_phone || '',
      receiver_phone: payment.sender_phone || '',
      provider_name: '',
    });
    setRegisterOpen(true);
  };

  const handleRegisterAndRetry = async () => {
    if (!registerTarget) return;
    if (!regForm.sender_phone || !regForm.receiver_phone) {
      toast({ title: 'Khalad', description: 'Buuxi sender + receiver phone', variant: 'destructive' });
      return;
    }
    setIsRegistering(true);
    try {
      // Insert offline_registrations row (upsert-like)
      const chosenProvider = providersList.find(
        (p) => p.provider_name.toLowerCase().split(/\s+/)[0] === regForm.provider_name,
      );
      await supabase.from('offline_registrations').insert({
        sender_phone: regForm.sender_phone,
        receiver_phone: regForm.receiver_phone,
        provider_id: chosenProvider?.id ?? null,
        provider_name: chosenProvider?.provider_name ?? regForm.provider_name ?? null,
        is_active: true,
      });
      // Re-invoke processor to attempt a fresh match for this receipt
      const { error: fnErr } = await supabase.functions.invoke('process-payment-receipt', {
        body: {
          sender_phone: registerTarget.sender_phone,
          receiver_sim: registerTarget.receiver_sim,
          amount: Number(registerTarget.amount),
          sms_body: registerTarget.raw_sms_body || registerTarget.sms_body || '',
          tx_id: (registerTarget.tx_id || '') + '-retry-' + Date.now(),
        },
      });
      if (fnErr) throw fnErr;
      toast({ title: 'La diiwaangeliyay', description: 'Lambarka waa la kaydiyay oo dib loo dirayay.' });
      setRegisterOpen(false);
      setRegisterTarget(null);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setIsRegistering(false);
    }
  };

  // Resolve the provider registered for a sender number (never guess from the SIM
  // that received the SMS — that SIM belongs to our own delivery device).
  const resolveRegistration = async (payment: any) => {
    const sender = String(payment.sender_phone || '').replace(/\D/g, '').slice(-9);
    const { data: regs } = await supabase
      .from('offline_registrations')
      .select('*')
      .eq('sender_phone', sender)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    const reg: any = regs?.[0];
    const receiver = String(reg?.receiver_phone || sender).replace(/\D/g, '').slice(-9);
    let provider = reg?.provider_id ? providersList.find((p) => p.id === reg.provider_id) : undefined;
    if (!provider && reg?.provider_name) {
      const token = String(reg.provider_name).toLowerCase().split(/\s+/)[0];
      provider = providersList.find((p) => p.provider_name.toLowerCase().split(/\s+/)[0] === token);
    }
    if (!provider) {
      const token = PREFIX_PROVIDER[receiver.slice(0, 2)];
      if (token) provider = providersList.find((p) => p.provider_name.toLowerCase().startsWith(token));
    }
    return { receiver, provider };
  };

  const createOrderForPackage = async (payment: any, receiverPhone: string, providerId: string, pkg: any) => {
    const providerName = providersList.find((p) => p.id === providerId)?.provider_name || '';
    await queueUnmatchedDelivery(supabase, { payment, receiverPhone, providerId, providerName, pkg });

    setUnmatchedPayments((prev) => prev.filter((p) => p.id !== payment.id));
    toast({ title: 'Dalab la diyaariyey', description: `${pkg.package_name} ayaa safka dirista loogu daray ${receiverPhone}.` });
  };

  const openPicker = async (payment: any) => {
    setPickerTarget(payment);
    setPickerSelectedPkgId('');
    setPickerSearch('');
    setPickerCategoryId('all');
    const { provider, receiver } = await resolveRegistration(payment);
    setPickerProviderId(provider?.id || '');
    setPickerReceiver(receiver || '');
    setPickerOpen(true);
  };

  const handlePickerSubmit = async () => {
    if (!pickerTarget || !pickerSelectedPkgId || !pickerProviderId) {
      toast({ title: 'Khalad', description: 'Dooro shirkad iyo xirmo.', variant: 'destructive' });
      return;
    }
    const receiver = pickerReceiver.replace(/\D/g, '').slice(-9);
    if (!/^\d{9}$/.test(receiver)) {
      toast({ title: 'Khalad', description: 'Lambarka qaataha waa inuu noqdaa 9 lambar.', variant: 'destructive' });
      return;
    }
    const pkg = pickerPackages.find((p) => p.id === pickerSelectedPkgId);
    if (!pkg) return;
    setPickerSubmitting(true);
    try {
      await createOrderForPackage(pickerTarget, receiver, pickerProviderId, pkg);
      setPickerOpen(false);
      setPickerTarget(null);
      setDoneInfo({
        pkg: pkg.package_name,
        price: pkg.selling_price,
        provider: providersList.find((p) => p.id === pickerProviderId)?.provider_name || '',
        receiver,
      });
      setDoneOpen(true);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setPickerSubmitting(false);
    }
  };

  // "Dib u dir": always ask the admin for provider / category / package / receiver.
  const handleRetry = async (payment: any) => {
    setRetryingId(payment.id);
    try {
      await openPicker(payment);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setRetryingId(null);
    }
  };

  const confirmAutoSend = async () => {
    if (!autoTarget) return;
    setAutoSubmitting(true);
    try {
      await createOrderForPackage(autoTarget.payment, autoTarget.receiver, autoTarget.provider.id, autoTarget.pkg);
      setAutoOpen(false);
      setAutoTarget(null);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setAutoSubmitting(false);
    }
  };


  const openApprove = (payment: any) => {
    setApproveTarget(payment);
    setApproveReason('');
    setApproveOpen(true);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    if (!approveReason.trim()) {
      toast({ title: 'Khalad', description: 'Fadlan sababta qor.', variant: 'destructive' });
      return;
    }
    setApproveSubmitting(true);
    try {
      const payment = approveTarget;
      const { receiver, provider } = await resolveRegistration(payment);
      let pkg: any = null;
      if (provider) {
        const { data: pkgs } = await supabase
          .from('data_packages_config')
          .select('id, package_name, data_amount, selling_price, provider_id')
          .eq('provider_id', provider.id)
          .eq('is_active', true)
          .eq('selling_price', Number(payment.amount))
          .limit(1);
        pkg = pkgs?.[0] || null;
      }

      const senderPhone = String(payment.sender_phone || '').replace(/\D/g, '').slice(-9);
      const { data: userData } = await supabase.auth.getUser();
      const { error: orderErr } = await supabase.from('orders').insert({
        customer_phone: senderPhone,
        sender_phone: senderPhone,
        receiver_phone: receiver,
        package_id: pkg?.id ?? null,
        provider_id: provider?.id ?? null,
        package_name: pkg?.package_name ?? `Approved manual $${payment.amount}`,
        data_amount: pkg?.data_amount ?? null,
        selling_price: Number(payment.amount),
        cost_price: 0,
        status: 'completed',
        delivery_status: 'delivered',
        payment_source: 'offline_unmatched_approved',
        is_manual: true,
        tx_id: payment.tx_id || null,
        delivered_at: new Date().toISOString(),
        manual_action_type: 'approved',
        manual_action_note: approveReason.trim(),
        manual_action_at: new Date().toISOString(),
        manual_action_by: userData?.user?.id ?? null,
        manual_action_email: userData?.user?.email ?? null,
      });
      if (orderErr) throw orderErr;

      await supabase.from('payment_receipts').update({
        status: 'matched',
        admin_notes: `Approved by admin: ${approveReason.trim()}`,
        processed_at: new Date().toISOString(),
      }).eq('id', payment.id);

      setUnmatchedPayments((prev) => prev.filter((p) => p.id !== payment.id));
      toast({ title: 'La ansixiyay', description: 'Dalabka waa la kaydiyay, lacagtiisana totals-ka laguma darin.' });
      setApproveOpen(false);
      setApproveTarget(null);
      navigate('/simple-admin/transactions');
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setApproveSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">⚠️ Unmatched ({filteredPayments.length})</CardTitle>
          {someSelected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="h-8 text-xs gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  Tirtir ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hubi tirtiridda</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ma hubtaa inaad rabto inaad tirtirto {selectedIds.size} qoraal? Tani waa wax aan dib loo soo celin karin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Jooji</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSelected} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Haa, tirtir'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <TabsList className="grid grid-cols-5 w-full h-9">
            <TabsTrigger value="today" className="text-xs">Maanta</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">Isbuucan</TabsTrigger>
            <TabsTrigger value="month" className="text-xs">Bishaan</TabsTrigger>
            <TabsTrigger value="year" className="text-xs">Sanadkan</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">Dhammaan</TabsTrigger>
          </TabsList>
        </Tabs>

        {filteredPayments.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all-unmatched" />
            <label htmlFor="select-all-unmatched" className="text-xs text-muted-foreground cursor-pointer">
              Dooro dhammaan ({filteredPayments.length})
            </label>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {filteredPayments.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {filteredPayments.map((payment) => {
                const reason = getUnmatchedReason(payment);
                const isSelected = selectedIds.has(payment.id);
                return (
                  <div
                    key={payment.id}
                    className={`border rounded-lg p-3 bg-card text-xs space-y-2 ${isSelected ? 'border-primary ring-1 ring-primary' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(payment.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-mono font-medium">{payment.sender_phone}</span>
                          <span className="font-semibold">${payment.amount}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            SIM-ka helay: {payment.receiver_sim}{deviceSims[payment.receiver_sim] ? ` · ${deviceSims[payment.receiver_sim]}` : ''}
                          </Badge>

                          <span className="text-muted-foreground text-[10px]">{new Date(payment.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-start gap-2 bg-muted/50 rounded p-2">
                          {reason.icon}
                          <div>
                            <p className="font-medium text-xs">{reason.title}</p>
                            <p className="text-[10px] text-muted-foreground">{reason.detail}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1" onClick={() => openRegister(payment)}>
                            <FilePlus className="h-3 w-3" /> Diiwaangeli
                          </Button>
                          <Button size="sm" variant="secondary" className="h-7 text-[10px] flex-1 gap-1" disabled={retryingId === payment.id} onClick={() => handleRetry(payment)}>
                            {retryingId === payment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Dib u dir
                          </Button>
                          <Button size="sm" className="h-7 text-[10px] flex-1 gap-1 bg-green-600 hover:bg-green-700" onClick={() => openApprove(payment)}>
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Sender Phone</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Sababta (Reason)</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Falal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const reason = getUnmatchedReason(payment);
                    const isSelected = selectedIds.has(payment.id);
                    return (
                      <TableRow key={payment.id} data-state={isSelected ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(payment.id)} />
                        </TableCell>
                        <TableCell className="font-mono">{payment.sender_phone}</TableCell>
                        <TableCell className="font-semibold">${payment.amount}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.receiver_sim}</Badge>
                          {deviceSims[payment.receiver_sim] && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{deviceSims[payment.receiver_sim]}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 max-w-xs">
                            {reason.icon}
                            <div>
                              <p className="text-sm font-medium">{reason.title}</p>
                              <p className="text-xs text-muted-foreground">{reason.detail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(payment.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openRegister(payment)}>
                              <FilePlus className="h-3 w-3" /> Diiwaangeli
                            </Button>
                            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" disabled={retryingId === payment.id} onClick={() => handleRetry(payment)}>
                              {retryingId === payment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Dib u dir
                            </Button>
                            <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => openApprove(payment)}>
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>✅ Ma jiro lacag aan match noqon muddadan</p>
          </div>
        )}
      </CardContent>

      <Dialog open={approveOpen} onOpenChange={(o) => { setApproveOpen(o); if (!o) setApproveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ansixi lacagta</DialogTitle>
            <DialogDescription>
              Qor sababta ansixinta. Dalabku Transactions-ka wuu ka muuqanayaa, laakiin lacagtiisa Revenue / Cost / Profit laguma xisaabinayo.
            </DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              ${approveTarget.amount} · {approveTarget.sender_phone}
            </div>
          )}
          <Textarea
            rows={3}
            placeholder="Sababta ansixinta..."
            value={approveReason}
            onChange={(e) => setApproveReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(false)}>Jooji</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmApprove} disabled={approveSubmitting}>
              {approveSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Haa, ansixi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={registerOpen} onOpenChange={(o) => { setRegisterOpen(o); if (!o) setRegisterTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Diiwaangeli lambarka</DialogTitle>
            <DialogDescription>
              Ku dar lambarka system-ka si markaa dib loo dirayo receipt-ka uu match noqdo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reg-sender">Sender Phone</Label>
              <Input id="reg-sender" value={regForm.sender_phone}
                onChange={(e) => setRegForm((p) => ({ ...p, sender_phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="reg-receiver">Receiver Phone</Label>
              <Input id="reg-receiver" value={regForm.receiver_phone}
                onChange={(e) => setRegForm((p) => ({ ...p, receiver_phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="reg-prov">Shirkadda (Provider)</Label>
              <Select value={regForm.provider_name} onValueChange={(v) => setRegForm((p) => ({ ...p, provider_name: v }))}>
                <SelectTrigger id="reg-prov">
                  <SelectValue placeholder="-- Dooro Shirkad --" />
                </SelectTrigger>
                <SelectContent>
                  {providersList.map((p) => (
                    <SelectItem key={p.id} value={p.provider_name.toLowerCase().split(/\s+/)[0]}>
                      {p.provider_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {registerTarget && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Receipt: ${registerTarget.amount} · SIM {registerTarget.receiver_sim}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegisterOpen(false)}>Jooji</Button>
            <Button onClick={handleRegisterAndRetry} disabled={isRegistering}>
              {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydi & Dib u dir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Dib u dir" — admin picks provider / category / package / receiver */}
      <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setPickerTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Dib u Dir Dalabka (Unmatched)
            </DialogTitle>
            {pickerTarget && (
              <DialogDescription>
                Sender: {pickerTarget.sender_phone} · Lacag: ${pickerTarget.amount} · SIM: {pickerTarget.receiver_sim}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Provider / Shirkadda</Label>
              <Select
                value={pickerProviderId}
                onValueChange={(v) => { setPickerProviderId(v); setPickerSelectedPkgId(''); setPickerCategoryId('all'); }}
              >
                <SelectTrigger><SelectValue placeholder="-- Dooro Shirkad --" /></SelectTrigger>
                <SelectContent>
                  {providersList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Category (ikhtiyaari)</Label>
              <Select value={pickerCategoryId} onValueChange={(v) => { setPickerCategoryId(v); setPickerSelectedPkgId(''); }}>
                <SelectTrigger><SelectValue placeholder="Dhammaan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Dhammaan</SelectItem>
                  {pickerCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Raadi Package</Label>
              <Input
                placeholder="Magaca, data ama qiimaha..."
                value={pickerSearch}
                onChange={(e) => {
                  setPickerSearch(e.target.value);
                  setPickerSelectedPkgId('');
                }}
                disabled={!pickerProviderId || pickerLoading}
              />
            </div>

            <div>
              <Label>Package</Label>
              <Select value={pickerSelectedPkgId} onValueChange={setPickerSelectedPkgId} disabled={!pickerProviderId || pickerLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={pickerLoading ? 'Waa la soo raraya...' : 'Dooro package'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {visiblePickerPackages.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">Xirmo ma jirto.</div>
                  ) : visiblePickerPackages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.package_name} · ${p.selling_price}
                      {Number(p.selling_price) === Number(pickerTarget?.amount) ? ' ✅' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Numberka Qaataha</Label>
              <Input
                inputMode="numeric"
                placeholder="61XXXXXXX"
                value={pickerReceiver}
                onChange={(e) => setPickerReceiver(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Ka noqo</Button>
            <Button onClick={handlePickerSubmit} disabled={pickerSubmitting || !pickerSelectedPkgId} className="gap-1">
              {pickerSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Dib u Dir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success confirmation after a manual resend */}
      <AlertDialog open={doneOpen} onOpenChange={setDoneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Dalabka safka dirista ayaa lagu daray
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>Xirmada: <b>{doneInfo?.pkg}</b> (${doneInfo?.price})</div>
                <div>Shirkadda: <b>{doneInfo?.provider}</b></div>
                <div>Loo diray: <b>{doneInfo?.receiver}</b></div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDoneOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto retry confirmation — no provider/package questions */}
      <AlertDialog open={autoOpen} onOpenChange={(o) => { setAutoOpen(o); if (!o) setAutoTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ma hubtaa inaad dirto dalabkan?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>Xirmada: <b>{autoTarget?.pkg?.package_name}</b> (${autoTarget?.pkg?.selling_price})</div>
                <div>Shirkadda: <b>{autoTarget?.provider?.provider_name}</b></div>
                <div>Loo dirayo: <b>{autoTarget?.receiver}</b></div>
                <div className="text-muted-foreground">Lacagta: ${autoTarget?.payment?.amount} · Diraha: {autoTarget?.payment?.sender_phone}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Maya</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmAutoSend(); }} disabled={autoSubmitting}>
              {autoSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Haa, dir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>

  );
};

export default UnmatchedPayments;
