import { useEffect, useState } from 'react';
import { Plus, Server, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SomlinkManualView } from './simple/SomlinkManualView';
import somlinkLogo from '@/assets/providers/somlink-logo.png';

/** Somlink API presented alongside physical devices, without pretending to be an Android SIM. */
export function SomlinkDashboardDevice({ isSo }: { isSo: boolean }) {
  const { can, loading } = useAdminPermissions();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceAt, setBalanceAt] = useState<string | null>(null);
  const canViewBalance = can('view_profit');
  // This is the same permission used by the existing Somlink Manual Send page.
  const canManual = can('manage_settings');

  useEffect(() => {
    let active = true;
    // The provider's existence is independent of Cloudflare runtime secrets.
    // A missing/failed status endpoint must not hide an active Somlink SIM card.
    const checkProvider = async () => {
      try {
        const { data, error } = await supabase.from('providers_config')
          .select('id,provider_name,is_active').eq('is_active', true);
        if (error) throw error;
        if (active) setProviderAvailable((data || []).some(provider =>
          provider.provider_name.trim().toLowerCase() === 'somlink'
        ));
      } catch {
        if (active) setProviderAvailable(null);
      }
    };
    void checkProvider();
    window.addEventListener('focus', checkProvider);
    return () => { active = false; window.removeEventListener('focus', checkProvider); };
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch('/api/public/somlink-status', { cache: 'no-store' });
        if (!res.ok) throw new Error('Status unavailable');
        const data = await res.json();
        if (active) setConfigured(data.configured === true);
      } catch {
        if (active) setConfigured(null);
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => { active = false; window.removeEventListener('focus', check); };
  }, []);

  useEffect(() => {
    if (configured !== true || !canViewBalance || loading) return;
    let active = true;
    void (async () => {
      // Somlink exposes no verified live balance endpoint in this app.
      // This is only the last successful delivery's reported balance.
      const { data } = await supabase.from('delivery_queue')
        .select('somlink_response,completed_at')
        .ilike('provider_name', 'somlink').eq('status', 'completed')
        .order('completed_at', { ascending: false }).limit(1).maybeSingle();
      if (!active || !data) return;
      const value = Number((data.somlink_response as any)?.balance);
      if (Number.isFinite(value) && (data.somlink_response as any)?.balance != null) setBalance(value);
      setBalanceAt(data.completed_at);
    })();
    return () => { active = false; };
  }, [configured, canViewBalance, loading, open]);

  // Show the card for an active Somlink provider, even when API status is
  // unavailable or credentials require setup. Never label that as "Live".
  if (providerAvailable !== true) return null;

  return (
    <>
      <section aria-label="Somlink API virtual device"
        className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden text-[11px]">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-750 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
              <Server className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold text-gray-900 dark:text-white text-xs truncate">Somlink API</span>
                <span className={'inline-flex items-center gap-0.5 px-1 py-px rounded-full text-[8px] font-semibold ' +
                  (configured === true ? 'bg-blue-100 text-blue-700' : configured === false ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>
                  <span className={'w-1 h-1 rounded-full ' + (configured === true ? 'bg-blue-500' : configured === false ? 'bg-amber-500' : 'bg-gray-400')} />
                  {configured === true ? 'Configured' : configured === false ? 'Setup needed' : 'Not verified'}
                </span>
              </div>
              <div className="text-[8px] text-gray-400 truncate">Virtual API · {isSo ? 'Ma aha Android SIM' : 'Not an Android SIM'}</div>
            </div>
          </div>
        </div>

        <div className="p-2 space-y-2">
          <div className="rounded-lg border border-purple-300 shadow-sm overflow-hidden">
            <div className="bg-purple-600 px-2 py-1 flex items-center justify-between">
              <div className="flex items-center gap-1 min-w-0">
                <img src={somlinkLogo} alt="" className="w-4 h-4 rounded-full object-contain bg-white flex-shrink-0" />
                <span className="font-semibold text-[10px] text-white truncate">SIM: Somlink</span>
              </div>
              <button type="button"
                aria-label={isSo ? 'Somlink dalab manual' : 'Somlink manual delivery'}
                title={isSo ? 'Dalab Manual' : 'Manual Send'}
                disabled={loading || !canManual}
                onClick={() => setOpen(true)}
                className="w-5 h-5 rounded-full bg-white/30 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30">
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 px-2 py-1.5">
              <div className="flex items-center justify-between text-[10px] gap-1">
                <span className="text-gray-500"><Wallet className="inline w-3 h-3 mr-1" />Balance:</span>
                <span className="font-bold text-gray-900 dark:text-white tabular-nums">
                  {canViewBalance ? (balance === null ? '—' : '$' + balance.toFixed(2)) : (isSo ? 'Xaddidan' : 'Restricted')}
                </span>
              </div>
              <div className="text-[8px] text-gray-400 mt-1 truncate">
                {isSo ? 'Haraagii ugu dambeeyay' : 'Last reported'}: {balanceAt ? new Date(balanceAt).toLocaleDateString('en-GB') : '—'} · {isSo ? 'Ma aha live' : 'Not live'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{isSo ? 'Somlink — Dalab Manual' : 'Somlink — Manual Send'}</DialogTitle>
            <DialogDescription>{isSo ? 'Marka hore dooro category, kadib xirmada iyo lambar 64XXXXXXX.' : 'Choose category, bundle and recipient 64XXXXXXX.'}</DialogDescription>
          </DialogHeader>
          {open && configured !== true && (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {isSo
                ? 'Somlink API lama xaqiijin. Hubi credentials-ka server-ka; dalab lacag jaraya lama diri karo ilaa API-ga la diyaariyo.'
                : 'Somlink API setup is not verified. Check server credentials before sending a paid order.'}
            </p>
          )}
          {open && configured === true && <SomlinkManualView isSo={isSo} embedded onSuccess={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
