// @ts-nocheck
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Phone, Package, DollarSign, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { BottomNavigation } from '@/components/BottomNavigation';

import { fetchCustomerOrders, getCustomerPhones, normalizeSomaliPhone, watchCustomerOrders } from '@/lib/customerOrders';

const ScheduledOrders: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // filter removed — show all scheduled orders

  const load = useCallback(async () => {
    const phones = getCustomerPhones();

    if (phones.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setOrders(await fetchCustomerOrders(phones, true));
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Khalad', description: 'Lama soo dejin karin', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    return watchCustomerOrders('scheduled-order-changes', load);
  }, [load]);

  const now = new Date();
  const upcoming = orders.filter(
    (o) => o.scheduled_for && new Date(o.scheduled_for) > now && o.delivery_status !== 'delivered' && o.status !== 'cancelled'
  );
  const past = orders.filter(
    (o) => o.scheduled_for && new Date(o.scheduled_for) <= now
  );

  const shown = orders;

  const cancel = async (id: string) => {
    if (!confirm('Ma hubtaa inaad kansaleyso dalabkan?')) return;
    const phone = normalizeSomaliPhone(
      localStorage.getItem('verifiedPhone') || localStorage.getItem('offlineSenderPhone') || ''
    );
    const { data, error } = await (supabase as any).rpc('cancel_scheduled_order', {
      p_order_id: id,
      customer_phone_number: phone,
    });
    if (error || data === false) {
      toast({ title: 'Khalad', description: 'Lama kansali karin', variant: 'destructive' });
      return;
    }
    toast({ title: 'Waa la kansalay' });
    load();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'hsl(var(--primary))',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
        }}
      >
        <div className="px-4 pt-3 pb-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Dalabyada Qorsheysan</h1>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: 'calc(4.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="py-3" />

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Waa la soo dejinayaa…</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">Wax dalab qorsheysan ah ma jiraan</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((o) => {
              const when = o.scheduled_for ? new Date(o.scheduled_for) : null;
              const isPast = when && when <= now;
              const canCancel = o.status !== 'cancelled' && o.delivery_status !== 'delivered' && !isPast;
              return (
                <div key={o.id} className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-primary" />
                        {o.package_name}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        o.status === 'cancelled'
                          ? 'bg-red-100 text-red-700'
                          : o.delivery_status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-700'
                          : isPast
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {o.status === 'cancelled'
                        ? 'Kanselay'
                        : o.delivery_status === 'delivered'
                        ? 'La diray'
                        : isPast
                        ? 'Dib u dhacay'
                        : 'Sugaya'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {when ? format(when, 'dd MMM yyyy, hh:mm a') : '-'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      +252{o.receiver_phone}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      ${Number(o.selling_price).toFixed(2)}
                    </div>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => cancel(o.id)}
                      className="mt-3 w-full py-2 rounded-xl bg-red-50 text-red-600 font-semibold text-sm flex items-center justify-center gap-1.5 active:bg-red-100"
                    >
                      <XCircle className="w-4 h-4" />
                      Kansal
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNavigation />
    </div>
  );
};

export default ScheduledOrders;
