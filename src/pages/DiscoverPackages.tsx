// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Smartphone, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/lib/utils';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import { normalizeSomaliPhone } from '@/lib/customerOrders';
import { requestPackageDiscovery, readDiscoveryQueue, readDiscoveredPackages, releaseDiscoverySession } from '@/lib/packageDiscovery';

const POLL_MS = 2500; // fallback — real-time ayaa horta wax cusboonaysiiya
const MAX_WAIT_MS = 300000; // 5 daqiiqo — safka + baarista
const HOLD_SECONDS = 300;

const safePrice = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? `$${formatPrice(n)}` : '—';
};




const DiscoverPackages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { provider } = useParams<{ provider: string }>();

  const rootPackage = location.state?.rootPackage;
  const providerName = location.state?.providerName || 'Provider';
  const senderPhone = location.state?.senderPhone || '';
  const initialReceiver = location.state?.receiverPhone || '';
  const paymentProviderId = location.state?.paymentProviderId;

  const [receiver, setReceiver] = useState(initialReceiver);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'input' | 'searching' | 'results'>('input');
  const [packages, setPackages] = useState<any[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [queue, setQueue] = useState<{ position: number; ahead: number; active: boolean }>({ position: 1, ahead: 0, active: false });
  const [holdLeft, setHoldLeft] = useState(0);
  const sessionSecondsRef = useRef(HOLD_SECONDS);
  const timers = useRef<any[]>([]);
  const autoStarted = useRef(false);
  const discoveryIdRef = useRef<string | null>(null);
  const purchasedRef = useRef(false);
  const pollRef = useRef<null | (() => void)>(null);
  const attemptRef = useRef(0);
  const startingRef = useRef(false);
  const channelsRef = useRef<any[]>([]);

  const clearChannels = () => {
    channelsRef.current.forEach((ch) => {
      try { supabase.removeChannel(ch); } catch { /* noop */ }
    });
    channelsRef.current = [];
  };

  const stopDiscovery = () => {
    attemptRef.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    clearChannels();
    const id = discoveryIdRef.current;
    discoveryIdRef.current = null;
    if (id && !purchasedRef.current) {
      return releaseDiscoverySession(id).catch(error => console.error('Discovery release failed:', error));
    }
    return Promise.resolve();
  };

  useEffect(() => () => { void stopDiscovery(); }, []);

  // Xiriirka shirkadda (session) waa furan yahay muddo kooban kadib baarista.
  useEffect(() => {
    if (phase !== 'results' || packages.length === 0) return;
    setHoldLeft(sessionSecondsRef.current);
    const id = setInterval(() => {
      setHoldLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, packages.length]);


  useEffect(() => {
    if (!rootPackage) navigate(-1);
  }, [rootPackage, navigate]);


  const startDiscovery = async () => {
    if (startingRef.current) return;
    const clean = normalizeSomaliPhone(receiver);
    if (clean.length !== 9) {
      setError('Fadlan gali lambarka oo dhan (9 lambar)');
      return;
    }
    const release = stopDiscovery();
    const attempt = attemptRef.current;
    const isCurrent = () => attempt === attemptRef.current;
    startingRef.current = true;
    purchasedRef.current = false;
    setReceiver(clean);
    setPackages([]);
    setHoldLeft(0);
    setError('');
    setPhase('searching');
    setElapsed(0);
    let data: any;
    try {
      await release;
      if (!isCurrent()) return;
      data = await requestPackageDiscovery(rootPackage?.id, clean);
      if (!isCurrent()) {
        await releaseDiscoverySession(data.id);
        return;
      }
      discoveryIdRef.current = data.id;
    } catch (e: any) {
      if (isCurrent()) {
        setPhase('input');
        setError(e?.message || 'Internet-ku wuu go\'ay. Fadlan isku day mar kale.');
      }
      return;
    } finally {
      startingRef.current = false;
    }

    const started = Date.now();
    setQueue({ position: 1, ahead: 0, active: false });
    timers.current.forEach(clearTimeout);
    timers.current = [];
    clearChannels();

    let polling = false;
    const poll = async () => {
      if (polling || !isCurrent()) return;
      polling = true;
      try {
        await runPoll();
      } finally {
        polling = false;
      }
    };
    pollRef.current = poll;

    const runPoll = async () => {
      const spent = Date.now() - started;

      // 1) Xaalada safka (booska + ma bilaabatay iyo in kale)
      let q: any = null;
      try {
        q = await readDiscoveryQueue(data.id);
        if (!isCurrent()) return;
      } catch (e) {
        if (!isCurrent()) return;
        if (spent <= MAX_WAIT_MS) {
          timers.current.push(setTimeout(poll, 1500));
          return;
        }
      }

      if (q?.found) {
        const claimedAt = q.claimed_at ? new Date(q.claimed_at).getTime() : null;
        // Waqtiga la tuso wuxuu bilaabmayaa marka baaristu dhab ahaan bilaabato
        setElapsed(Math.round(((claimedAt ? Date.now() - claimedAt : 0)) / 1000));
        setQueue({
          position: Number(q.position) || 1,
          ahead: Number(q.ahead) || 0,
          active: q.status === 'processing' || q.status === 'done',
        });

        if (q.status === 'failed') {
          clearChannels();
          setPhase('input');
          setError(
            q.error === 'no_device_available'
              ? 'Hadda dhammaan xiriirada shirkadda way mashquul yihiin. Fadlan daqiiqad kadib isku day.'
              : 'Xirmooyinka lambarkan lama heli karin hadda. Fadlan isku day mar kale.',
          );
          return;
        }
      } else {
        setElapsed(Math.round(spent / 1000));
      }

      // 2) Haddii ay dhammaatay, xirmooyinka soo qaado
      if (q?.status === 'done') {
        let res: any = null;
        try {
          res = await readDiscoveredPackages(data.id);
          if (!isCurrent()) return;
        } catch (e) {
          if (!isCurrent()) return;
          if (spent > MAX_WAIT_MS) {
            void stopDiscovery();
            setPhase('input');
            setError('Xirmooyinka lama soo dejin karin. Fadlan isku day mar kale.');
            return;
          }
          timers.current.push(setTimeout(poll, 1000));
          return;
        }
        if (res?.status === 'done') {
          const left = Number(res?.session_seconds_left);
          sessionSecondsRef.current = Number.isFinite(left) ? Math.max(0, left) : HOLD_SECONDS;
          setPackages(Array.isArray(res.packages) ? res.packages : []);
          clearChannels();
          setPhase('results');
          return;
        }
      }

      if (spent > MAX_WAIT_MS) {
        void stopDiscovery();
        setPhase('input');
        setError('Xirmooyinka lambarkan lama heli karin hadda. Fadlan isku day mar kale.');
        return;
      }
      timers.current.push(setTimeout(poll, POLL_MS));
    };

    // Real-time: isbeddel kasta oo dhaca dalabkeenna ama safka guud
    // isla markiiba wuxuu keenayaa cusboonaysiin (polling waa fallback kaliya).
    try {
      const own = supabase
        .channel(`discovery:${data.id}`)
        .on('broadcast', { event: 'discovery_update' }, () => { poll(); })
        .subscribe();
      const queueCh = supabase
        .channel('discovery_queue')
        .on('broadcast', { event: 'discovery_update' }, () => { poll(); })
        .subscribe();
      channelsRef.current = [own, queueCh];
    } catch { /* haddii real-time fashilmo, polling ayaa shaqeynaya */ }

    poll();
  };


  useEffect(() => {
    if (autoStarted.current) return;
    if (rootPackage && normalizeSomaliPhone(initialReceiver).length === 9) {
      autoStarted.current = true;
      startDiscovery();
    }
  }, [rootPackage, initialReceiver]);

  const choosePackage = (pkg: any) => {
    if (holdLeft <= 0 || pkg.price_missing || pkg.selling_price == null) return;
    purchasedRef.current = true;
    navigate(`/payment/${provider}`, {
      state: {
        package: {
          id: rootPackage.id,
          providerId: rootPackage.providerId || provider,
          categoryId: rootPackage.categoryId,
          name: pkg.label,
          price: safePrice(pkg.selling_price),
          data: pkg.info_line1 || pkg.label,
          validity: pkg.info_line2 || '',
          ussdCode: null,
          phonePrefix: null,
          discoveryLabel: pkg.label,
          discoveryIndex: pkg.index,
        },
        providerName,
        categoryName: rootPackage.name,
        receiverPhone: receiver,
        senderPhone,
        paymentProviderId,
        autoConfirm: true,
      },
    });
  };


  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-primary text-primary-foreground px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Dib u noqo">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-semibold">{rootPackage?.name || 'Xirmooyin'}</h1>
          <p className="text-xs opacity-80">{providerName}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {phase === 'input' && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-foreground">Lambarka la siinayo</h2>
            <p className="text-sm text-muted-foreground">
              Gali lambarka aad rabto in internet-ka loo diro — waxaan kuu soo baaraynaa xirmooyinka lambarkaas u diyaarka ah.
            </p>
            <Input
              inputMode="numeric"
              placeholder="61XXXXXXX"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value.replace(/\D/g, '').slice(0, 9))}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={startDiscovery}>Soo baar xirmooyinka</Button>
          </div>
        )}

        {phase === 'searching' && (
          <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
            {queue.active ? (
              <>
                <h2 className="font-semibold text-foreground">Waa la baarayaa…</h2>
                <p className="text-sm text-muted-foreground">
                  Waxaan ka helaynaa shirkadda xirmooyinka lambarka {receiver}. Fadlan sug 10–40 ilbiriqsi.
                </p>
                <p className="text-xs text-muted-foreground">{elapsed}s</p>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-foreground">Waxaad ku jirtaa safka</h2>
                <p className="text-sm text-muted-foreground">
                  {queue.ahead > 0
                    ? <>Waxaa hadda socda baaritaanno kale — adigu waxaad tahay <span className="font-bold">#{queue.position}</span> safka ({queue.ahead} qof hor kaaga jira).</>
                    : <>Waxaan sugaynaa xiriirka shirkadda. Fadlan sug daqiiqad.</>}
                </p>
                <p className="text-xs text-muted-foreground">Lacag weli lama bixin — waad joojin kartaa markasta.</p>
                <Button variant="outline" size="sm" onClick={() => { void stopDiscovery(); setPhase('input'); }}>
                  Jooji
                </Button>
              </>
            )}
          </div>
        )}

        {phase === 'results' && (
          <>
            {packages.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Lambarkan xirmo diyaar ah lama helin.
                </p>
                <Button variant="outline" onClick={() => { void stopDiscovery(); setPhase('input'); }}>Isku day mar kale</Button>
              </div>
            ) : (
              <>
                <div className={`rounded-xl border p-3 text-center text-sm ${holdLeft > 0 ? 'border-primary/40 bg-primary/5 text-foreground' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
                  {holdLeft > 0 ? (
                    <>Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha <span className="font-bold">{holdLeft}s</span></>
                  ) : (
                    <>Waqtigii xiriirku wuu dhamaaday. Fadlan dib u baar xirmooyinka.</>
                  )}
                </div>
                {holdLeft === 0 && (
                  <Button variant="outline" className="w-full" onClick={startDiscovery}>
                    Dib u baar
                  </Button>
                )}
              </>
            )}
          </>
        )}
        {phase === 'results' && packages.length > 0 && (
          <div className="space-y-3">
            {packages.map((pkg: any, i: number) => (
              <div key={`${pkg.index}-${i}`} className="bg-card rounded-lg border border-border shadow-sm p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-foreground flex-1">{pkg.label}</h3>
                  <span className="text-2xl font-bold text-primary">
                    {pkg.price_missing ? '—' : safePrice(pkg.selling_price)}
                  </span>
                </div>
                <div className="h-0.5 mb-3 bg-primary w-full" />
                <div className="space-y-2 mb-4">
                  {pkg.info_line1 && (
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">{pkg.info_line1}</span>
                    </div>
                  )}
                  {pkg.info_line2 && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">{pkg.info_line2}</span>
                    </div>
                  )}
                </div>
                <Button
                  className="w-full font-semibold"
                  disabled={holdLeft === 0 || pkg.price_missing || pkg.selling_price == null}
                  onClick={() => choosePackage(pkg)}
                >
                  {pkg.price_missing || pkg.selling_price == null ? 'Qiimo lama helin' : 'IIBSO'}
                </Button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

const DiscoverPackagesPage = () => (
  <PageErrorBoundary>
    <DiscoverPackages />
  </PageErrorBoundary>
);

export default DiscoverPackagesPage;

