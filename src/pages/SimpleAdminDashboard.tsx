import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { SimpleAdminSidebar } from '@/components/admin/SimpleAdminSidebar';
import { Menu, RefreshCw, Globe, Moon, Sun, Plus, Pencil, Volume2, VolumeX, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AddManualDeliveryDialog } from '@/components/admin/AddManualDeliveryDialog';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { ReversalAlertsHeader } from '@/components/admin/ReversalAlertsHeader';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import alIslaamLogo from '@/assets/al-islaam-logo.svg';
import { calculateAlIslaamProfit, hasUssdFlowDelivery, isUssdFlowCode, isNonFinancialOrder } from '@/lib/profit';

interface DashboardStats {
  todayOrderCount: number;
  todayFailed: number;
  todayPending: number;
  todayProfit: number;
  todayCost: number;
  todaySales: number;
  todayDelivered: number;
  failed: number;
  pending: number;
  delivered: number;
  devicesOnline: number;
  unmatchedCount: number;
}

interface SimInfo {
  sim_slot: 1 | 2;
  sim_number: string;
  provider_name: string;
  provider_logo: string | null;
  evc_balance: number;
  evoucher_balance: number;
  evoucher_rate: number;
}

interface DeviceCardData {
  device_name: string;
  device_id: string;
  is_online: boolean;
  last_ping: string | null;
  battery_level: number | null;
  is_charging: boolean;
  sims: SimInfo[];
  todayDelivered: number;
  todayFailed: number;
  todayCost: number;
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
}

const getProviderColor = (name: string, simNumber?: string) => {
  const n = name.toLowerCase();
  if (n.includes('hormuud')) return { bg: 'bg-green-600', dark: 'bg-green-700', border: 'border-green-300' };
  if (n.includes('somnet')) return { bg: 'bg-blue-400', dark: 'bg-blue-500', border: 'border-blue-300' };
  if (n.includes('somtel')) return { bg: 'bg-yellow-500', dark: 'bg-yellow-600', border: 'border-yellow-300' };
  if (n.includes('amtel')) return { bg: 'bg-red-600', dark: 'bg-red-700', border: 'border-red-300' };
  if (n.includes('somlink')) return { bg: 'bg-purple-600', dark: 'bg-purple-700', border: 'border-purple-300' };
  if (simNumber) {
    const digits = simNumber.replace(/\D/g, '');
    const prefix = digits.startsWith('252') ? digits.slice(3, 5) : digits.slice(0, 2);
    if (prefix === '61' || prefix === '77') return { bg: 'bg-green-600', dark: 'bg-green-700', border: 'border-green-300' };
    if (prefix === '68') return { bg: 'bg-blue-400', dark: 'bg-blue-500', border: 'border-blue-300' };
    if (prefix === '62') return { bg: 'bg-yellow-500', dark: 'bg-yellow-600', border: 'border-yellow-300' };
    if (prefix === '71') return { bg: 'bg-red-600', dark: 'bg-red-700', border: 'border-red-300' };
    if (prefix === '64') return { bg: 'bg-purple-600', dark: 'bg-purple-700', border: 'border-purple-300' };
  }
  return { bg: 'bg-gray-600', dark: 'bg-gray-700', border: 'border-gray-300' };
};

const formatTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const SimpleAdminDashboard = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isSo = language === 'so';
  const { can } = useAdminPermissions();
  const canDevices = can('manage_devices');
  const [clock, setClock] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [stats, setStats] = useState<DashboardStats>({
    todayOrderCount: 0, todayFailed: 0, todayPending: 0, todayProfit: 0, todayCost: 0, todaySales: 0, todayDelivered: 0, failed: 0, pending: 0, delivered: 0, devicesOnline: 0, unmatchedCount: 0
  });
  const [deviceCards, setDeviceCards] = useState<DeviceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualDeliveryOpen, setManualDeliveryOpen] = useState(false);
  const [selectedSimForDelivery, setSelectedSimForDelivery] = useState<{ device_id: string; device_name: string; sim_slot: 1 | 2; provider_name: string } | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const stored = localStorage.getItem('admin_notifications_enabled');
    return stored !== 'false';
  });
  const [alertActive, setAlertActive] = useState(false);
  const [prevAlertCount, setPrevAlertCount] = useState(0);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  const toggleNotifications = () => {
    setNotificationsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('admin_notifications_enabled', String(next));
      return next;
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      const emergency = localStorage.getItem('adminEmergencySession');
      if (emergency === 'true') return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/admin/login'); return; }
      const { data: roleData } = await supabase
        .from('user_roles').select('role').eq('user_id', session.user.id)
        .in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
      if (!roleData) navigate('/admin/login');
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Mogadishu midnight expressed as UTC so browser/device timezone cannot skew "Maanta".
      const nowDate = new Date();
      const MOG_OFFSET = 3;
      const mogNowUtc = new Date(nowDate.getTime() + MOG_OFFSET * 60 * 60 * 1000);
      const todayISO = new Date(Date.UTC(
        mogNowUtc.getUTCFullYear(),
        mogNowUtc.getUTCMonth(),
        mogNowUtc.getUTCDate(),
        -MOG_OFFSET, 0, 0, 0,
      )).toISOString();

      // If a custom date is selected, calculate start/end for that date (Mogadishu midnight)
      const useCustomDate = !!selectedDate;
      let customStartISO = '';
      let customEndISO = '';
      if (useCustomDate) {
        const y = selectedDate!.getFullYear();
        const m = selectedDate!.getMonth();
        const d = selectedDate!.getDate();
        customStartISO = new Date(Date.UTC(y, m, d, -MOG_OFFSET, 0, 0, 0)).toISOString();
        customEndISO = new Date(Date.UTC(y, m, d + 1, -MOG_OFFSET, 0, 0, 0)).toISOString();
      }

      // Calculate period start for unmatched filter
      let periodStartISO = todayISO;
      if (!useCustomDate) {
        const mogNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Mogadishu' }));
        if (selectedPeriod === 'week') {
          mogNow.setDate(mogNow.getDate() - 7);
          mogNow.setHours(0, 0, 0, 0);
          periodStartISO = mogNow.toISOString();
        } else if (selectedPeriod === 'month') {
          mogNow.setDate(mogNow.getDate() - 30);
          mogNow.setHours(0, 0, 0, 0);
          periodStartISO = mogNow.toISOString();
        } else if (selectedPeriod === 'year') {
          mogNow.setFullYear(mogNow.getFullYear() - 1);
          mogNow.setHours(0, 0, 0, 0);
          periodStartISO = mogNow.toISOString();
        }
      }

      let unmatchedQuery = supabase.from('payment_receipts').select('id', { count: 'exact', head: true }).eq('status', 'unmatched');
      if (useCustomDate) {
        unmatchedQuery = unmatchedQuery.gte('created_at', customStartISO).lt('created_at', customEndISO);
      } else {
        unmatchedQuery = unmatchedQuery.gte('created_at', periodStartISO);
      }

      // Orders: when a custom date is selected, scope query to that day so 1000-row limit doesn't truncate older dates.
      let ordersQuery = supabase.from('orders').select('id, status, delivery_status, selling_price, cost_price, created_at, provider_id, package_id, discovery_root_id, payment_source');
      if (useCustomDate) {
        ordersQuery = ordersQuery.gte('created_at', customStartISO).lt('created_at', customEndISO);
      } else {
        // Limit to last ~13 months for non-custom (covers year period)
        const mogNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Mogadishu' }));
        mogNow.setMonth(mogNow.getMonth() - 13);
        ordersQuery = ordersQuery.gte('created_at', mogNow.toISOString());
      }

      const [ordersRes, devicesRes, balancesRes, providersRes, packagesRes, deliveryRes, analyticsRes, unmatchedRes] = await Promise.all([
        ordersQuery.limit(2000),
        supabase.from('android_devices').select('id, device_id, device_name, provider_name, sim1_provider, sim2_provider, sim_number, sim2_number, last_ping_at, is_active, battery_level, is_charging').eq('is_active', true),
        supabase.from('sim_balances').select('device_id, sim_slot, balance, balance_type, last_updated'),
        supabase.from('providers_config').select('id, evoucher_rate, provider_name, provider_logo'),
        supabase.from('data_packages_config').select('id, cost_price, is_discovery_root, ussd_code').limit(500),
        supabase.from('delivery_queue').select('android_device_id, status, created_at, order_id, ussd_code').gte('created_at', useCustomDate ? customStartISO : todayISO).limit(2000),
        supabase.rpc('get_admin_analytics_summary'),
        unmatchedQuery,
      ]);

      const providerRates = providersRes.data || [];
      const allOrders = ordersRes.data || [];
      const packageConfigs = packagesRes.data || [];
      const deliveryData = deliveryRes.data || [];
      const analyticsSummary = analyticsRes.data as Record<string, any> | null;

      const packageById = new Map(packageConfigs.map(pkg => [pkg.id, pkg]));
      const effectiveCost = (order: any) => {
        const stored = Number(order.cost_price || 0);
        if (stored > 0) return stored;
        return Number(packageById.get(order.package_id)?.cost_price || 0);
      };
      const isFinancialOrder = (order: any) =>
        !isNonFinancialOrder(order) &&
        order.status !== 'cancelled' &&
        (
          ['completed', 'paid', 'payment_confirmed', 'delivered'].includes(String(order.status || '').toLowerCase()) ||
          order.delivery_status === 'delivered'
        );
      const isFlowOrder = (order: any) => {
        const pkg = packageById.get(order.package_id);
        const deliveries = deliveryData.filter((dl: any) => dl.order_id === order.id);
        return Boolean(order.discovery_root_id) ||
          Boolean(pkg?.is_discovery_root) ||
          hasUssdFlowDelivery(deliveries) ||
          isUssdFlowCode(pkg?.ussd_code);
      };

      let todaySales: number, todayCost: number, todayProfit: number, todayDelivered: number, todayFailed: number, todayPending: number, todayOrderCount: number;

      if (useCustomDate) {
        // Custom dates use the exact same cost/profit rules as the production RPC.
        const dateOrders = allOrders.filter(o => o.created_at >= customStartISO && o.created_at < customEndISO && o.status !== 'cancelled');
        const financialOrders = dateOrders.filter(isFinancialOrder);
        todayDelivered = dateOrders.filter(o => o.delivery_status === 'delivered').length;
        todayFailed = dateOrders.filter(o => o.delivery_status === 'failed' || o.delivery_status === 'timeout').length;
        todayPending = dateOrders.filter(o => o.delivery_status === 'pending' || o.delivery_status === 'processing' || o.delivery_status === 'queued').length;
        todayOrderCount = financialOrders.length;
        todaySales = financialOrders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
        todayCost = financialOrders.reduce((s, o) => s + effectiveCost(o), 0);
        todayProfit = financialOrders.reduce((s, o) => {
          const rate = Number(providerRates.find(p => p.id === o.provider_id)?.evoucher_rate || 0);
          return s + calculateAlIslaamProfit(Number(o.selling_price || 0), effectiveCost(o), rate, isFlowOrder(o));
        }, 0);
      } else {
        // Production RPC is the source of truth for today/week/month/year.
        const rpcPeriod = analyticsSummary?.[selectedPeriod] as any;
        todaySales = Number(rpcPeriod?.revenue ?? 0);
        todayCost = Number(rpcPeriod?.cost ?? 0);
        todayProfit = Number(rpcPeriod?.profit ?? 0);
        todayDelivered = Number(rpcPeriod?.delivered ?? 0);
        todayFailed = Number(rpcPeriod?.failed ?? 0);
        todayPending = Number(rpcPeriod?.pending ?? 0);
        todayOrderCount = Number(rpcPeriod?.orders ?? (todayDelivered + todayFailed + todayPending));
      }

      const delivered = Number((analyticsSummary as any)?.delivered_orders ?? 0);
      const pending = Number((analyticsSummary as any)?.pending_orders ?? 0);
      const failed = Number((analyticsSummary as any)?.failed_orders ?? 0);

      const deviceList = (devicesRes.data || []).slice().sort((a, b) => (a.device_id || '').localeCompare(b.device_id || ''));
      const OFFLINE_THRESHOLD = 5 * 60 * 1000;
      const now = Date.now();
      const devicesOnline = deviceList.filter(d => d.last_ping_at && (now - new Date(d.last_ping_at).getTime()) < OFFLINE_THRESHOLD).length;
      const unmatchedCount = unmatchedRes.count ?? 0;

      // Alert logic: play sound if new unmatched/failed appear
      const alertTotal = unmatchedCount + todayFailed;
      if (alertTotal > prevAlertCount && prevAlertCount > 0) {
        setAlertActive(true);
        try {
          if (!alertAudioRef.current) {
            // Use Web Audio API for a beep
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.3;
            osc.start();
            setTimeout(() => { osc.stop(); ctx.close(); }, 500);
          }
        } catch (e) { /* audio not available */ }
      }
      setPrevAlertCount(alertTotal);

      setStats({ todayOrderCount, todayFailed, todayPending, todayProfit, todayCost, todaySales, todayDelivered, failed, pending, delivered, devicesOnline, unmatchedCount });

      const balanceData = balancesRes.data || [];
      const findProviderLogo = (provName: string) => {
        const match = providerRates.find(p => p.provider_name?.toLowerCase() === provName.toLowerCase());
        return match?.provider_logo || null;
      };
      const findProviderRate = (provName: string) => {
        const match = providerRates.find(p => p.provider_name?.toLowerCase() === provName.toLowerCase());
        return match?.evoucher_rate || 0;
      };

      const cards: DeviceCardData[] = deviceList.map(d => {
        const isOnline = d.last_ping_at ? (now - new Date(d.last_ping_at).getTime()) < OFFLINE_THRESHOLD : false;
        // sim_balances.device_id stores android_devices.id (UUID)
        const deviceBalances = balanceData.filter(b => b.device_id === d.id);
        
        const sims: SimInfo[] = [];
        const sim1Provider = d.sim1_provider || d.provider_name || '';
        const sim1Evc = deviceBalances.find(b => b.sim_slot === 1 && b.balance_type === 'evc_plus');
        const sim1Ev = deviceBalances.find(b => b.sim_slot === 1 && b.balance_type === 'evoucher');
        sims.push({
          sim_slot: 1, sim_number: d.sim_number || '', provider_name: sim1Provider,
          provider_logo: findProviderLogo(sim1Provider),
          evc_balance: sim1Evc?.balance || 0, evoucher_balance: sim1Ev?.balance || 0,
          evoucher_rate: findProviderRate(sim1Provider),
        });
        if (d.sim2_number && d.sim2_provider) {
          const sim2Evc = deviceBalances.find(b => b.sim_slot === 2 && b.balance_type === 'evc_plus');
          const sim2Ev = deviceBalances.find(b => b.sim_slot === 2 && b.balance_type === 'evoucher');
          sims.push({
            sim_slot: 2, sim_number: d.sim2_number, provider_name: d.sim2_provider,
            provider_logo: findProviderLogo(d.sim2_provider),
            evc_balance: sim2Evc?.balance || 0, evoucher_balance: sim2Ev?.balance || 0,
            evoucher_rate: findProviderRate(d.sim2_provider),
          });
        }

        // Per-device delivery stats today
        const deviceDeliveries = deliveryData.filter(dl => dl.android_device_id === d.device_id);
        const devDelivered = deviceDeliveries.filter(dl => dl.status === 'completed' || dl.status === 'delivered').length;
        const devFailed = deviceDeliveries.filter(dl => dl.status === 'failed').length;
        const devTotal = deviceDeliveries.length;

        // Device financials use the same selling/cost/profit rules as the dashboard.
        const orderIds = deviceDeliveries.map(dl => dl.order_id);
        const matchedOrders = allOrders.filter(o => orderIds.includes(o.id) && o.created_at >= todayISO && isFinancialOrder(o));
        const devRevenue = matchedOrders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
        const devCost = matchedOrders.reduce((s, o) => s + effectiveCost(o), 0);
        const devProfit = matchedOrders.reduce((s, o) => {
          const rate = Number(providerRates.find(p => p.id === o.provider_id)?.evoucher_rate || 0);
          const orderDeliveries = deviceDeliveries.filter(dl => dl.order_id === o.id);
          const pkg = o.package_id ? packageById.get(o.package_id) : undefined;
          const flow = Boolean(o.discovery_root_id) || Boolean(pkg?.is_discovery_root) ||
            hasUssdFlowDelivery(orderDeliveries) || isUssdFlowCode(pkg?.ussd_code);
          return s + calculateAlIslaamProfit(Number(o.selling_price || 0), effectiveCost(o), rate, flow);
        }, 0);

        return {
          device_name: d.device_name, device_id: d.device_id,
          is_online: isOnline, last_ping: d.last_ping_at,
          battery_level: d.battery_level, is_charging: d.is_charging || false,
          sims,
          todayDelivered: devDelivered, todayFailed: devFailed,
          todayCost: devCost, todayRevenue: devRevenue,
          todayProfit: devProfit, todayOrders: devTotal,
        };
      });

      setDeviceCards(cards);
    } catch (err) {
      console.error('SimpleAdmin fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDataCb = useCallback(() => { fetchData(); }, []);
  useEffect(() => { fetchData(); }, [selectedPeriod, selectedDate]);

  // Real-time: auto-refresh when orders, devices, balances, or delivery queue change
  useRealtimeRefresh(['orders', 'android_devices', 'delivery_queue', 'payment_receipts', 'device_alerts'], fetchDataCb, 800, { notify: notificationsEnabled, lang: isSo ? 'so' : 'en' });

  // Dedicated fast realtime for sim_balances → patch only sims of the matching device (no full re-fetch, no re-mount)
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-sim-balances-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sim_balances' }, (payload: any) => {
        const row = (payload.new || payload.old) as any;
        if (!row?.device_id) return;
        // device_id on sim_balances stores android_devices.id (UUID). Look up device, then patch its card.
        supabase.from('android_devices').select('id, device_id').eq('id', row.device_id).maybeSingle().then(({ data: dev }) => {
          if (!dev) return;
          setDeviceCards(prev => prev.map(card => {
            if (card.device_id !== dev.device_id) return card;
            const sims = card.sims.map(sim => {
              if (sim.sim_slot !== row.sim_slot) return sim;
              const newBal = Number(row.balance || 0);
              return {
                ...sim,
                evc_balance: row.balance_type === 'evc_plus' ? newBal : sim.evc_balance,
                evoucher_balance: row.balance_type === 'evoucher' ? newBal : sim.evoucher_balance,
              };
            });
            return { ...card, sims };
          }));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const periodLabel = selectedDate ? format(selectedDate, 'dd/MM') : selectedPeriod === 'today' ? 'Maanta' : selectedPeriod === 'week' ? 'Isbuucan' : selectedPeriod === 'month' ? 'Bisha' : 'Sanadka';

  const alertCount = stats.unmatchedCount + stats.todayFailed;

  const handleAlertCardTap = () => {
    setAlertActive(false);
    navigate('/simple-admin/unmatched');
  };

  const statCards = [
    { label: `Dalabyada ${periodLabel}`, value: stats.todayOrderCount, sub: `${stats.todayFailed} fashilmay · ${stats.todayPending} sugaya`, color: 'from-teal-400 to-teal-600', darkFooter: 'bg-teal-700', link: '/simple-admin/daily-orders' },
    { label: `Dakhliga ${periodLabel}`, value: `$${stats.todaySales.toFixed(2)}`, sub: `${stats.todayDelivered} dalab la diray`, color: 'from-red-500 to-red-600', darkFooter: 'bg-red-700', link: '/simple-admin/transactions' },
    { label: `Faaidada ${periodLabel}`, value: `$${stats.todayProfit.toFixed(2)}`, sub: `Qarash: $${stats.todayCost.toFixed(2)}`, color: 'from-green-500 to-green-700', darkFooter: 'bg-green-800', link: '/simple-admin/transactions' },
    { label: 'Unmatched', value: alertCount, sub: `${stats.unmatchedCount} unmatched · ${stats.todayFailed} fashilmay`, color: alertActive ? 'from-red-600 to-red-800' : 'from-blue-500 to-blue-700', darkFooter: alertActive ? 'bg-red-900' : 'bg-blue-800', link: '/simple-admin/unmatched', isAlert: true },
    { label: 'Orders', value: stats.todayOrderCount, sub: `${stats.todayDelivered} guul · ${stats.todayFailed} fashil`, color: 'from-pink-500 to-pink-700', darkFooter: 'bg-pink-800', link: '/simple-admin/abdiqafar' },
    ...(canDevices ? [{ label: 'Devices Online', value: stats.devicesOnline, color: 'from-yellow-400 to-yellow-600', darkFooter: 'bg-yellow-700', link: '/simple-admin/devices' }] : []),
  ];

  const clockStr = clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gray-100 dark:bg-gray-900">
        <SimpleAdminSidebar />
        
        <div className="flex-1 flex flex-col w-full">
          {/* Blue Header Bar */}
          <header className="bg-gradient-to-r from-green-700 to-green-500 text-white">
            <div className="flex items-center justify-center py-3 px-4">
              <div className="flex items-center gap-2">
                <img src={alIslaamLogo} alt="Logo" className="w-8 h-8 rounded-lg" />
                <h1 className="text-xl font-bold">Al-islaam <span className="font-light">Data</span></h1>
                {/* LIVE indicator */}
                <span className="flex items-center gap-1 bg-green-500/20 border border-green-400/40 px-2 py-0.5 rounded-full ml-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-[10px] font-bold text-green-300 tracking-wider">LIVE</span>
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-green-800/50">
              <SidebarTrigger className="text-white hover:bg-white/20">
                <Menu className="h-6 w-6" />
              </SidebarTrigger>
              <div className="bg-green-900/40 px-6 py-1.5 rounded text-lg font-mono tracking-wider">
                {clockStr}
              </div>
              <div className="flex items-center gap-1">
                <ReversalAlertsHeader iconClassName="h-5 w-5" />
                <button onClick={toggleNotifications} className="text-white hover:bg-white/20 p-2 rounded-full" title={notificationsEnabled ? 'Mute' : 'Unmute'}>
                  {notificationsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-50" />}
                </button>
                <button onClick={fetchData} className="text-white hover:bg-white/20 p-2 rounded-full">
                  <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </header>

          <div className="px-4 py-2 text-sm text-gray-500 flex items-center gap-1">
            🏠 Home &gt; Dashboard
          </div>

          <main className="flex-1 px-3 pb-6 space-y-4">
            {/* Period Picker */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
              {([
                { key: 'today' as const, label: 'Maanta' },
                { key: 'week' as const, label: 'Isbuucan' },
                { key: 'month' as const, label: 'Bisha' },
                { key: 'year' as const, label: 'Sanadka' },
              ]).map(item => (
                <button
                  key={item.key}
                  onClick={() => { setSelectedPeriod(item.key); setSelectedDate(undefined); }}
                  className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 transition-colors ${
                    selectedPeriod === item.key && !selectedDate
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 transition-colors flex items-center gap-1 ${
                    selectedDate
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                  }`}>
                    <CalendarIcon className="w-3 h-3" />
                    {selectedDate ? format(selectedDate, 'dd/MM/yy') : '📅'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => { setSelectedDate(date); }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              {statCards.map((card, i) => (
                <div
                  key={i}
                  className={`rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform flex flex-col ${i === statCards.length - 1 && statCards.length % 2 !== 0 ? 'col-span-2' : ''} ${(card as any).isAlert && alertActive ? 'animate-pulse ring-2 ring-red-400' : ''}`}
                  onClick={() => {
                    if ((card as any).isAlert) { handleAlertCardTap(); }
                    else { navigate(card.link); }
                  }}
                >
                  <div className={`bg-gradient-to-br ${card.color} text-white p-4 text-center flex-1`}>
                    <div className="text-3xl font-bold">{card.value}</div>
                    <div className="text-sm mt-1 opacity-90">{card.label}</div>
                    {card.sub && <div className="text-[10px] mt-1 opacity-70">{card.sub}</div>}
                  </div>
                  <div className={`${card.darkFooter} text-white text-center py-2 text-xs flex items-center justify-center gap-1 shrink-0`}>
                    <span>➡</span> More Info
                  </div>
                </div>
              ))}
            </div>

            {/* Blocked Users & SMS Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform" onClick={() => navigate('/simple-admin/blocked')}>
                <div className="bg-gradient-to-br from-gray-600 to-gray-800 text-white p-4 text-center">
                  <div className="text-3xl font-bold">🚫</div>
                  <div className="text-sm mt-1 opacity-90">Blocked Users</div>
                </div>
                <div className="bg-gray-900 text-white text-center py-2 text-xs flex items-center justify-center gap-1">
                  <span>➡</span> More Info
                </div>
              </div>
              <div className="rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform" onClick={() => navigate('/simple-admin/sms-logs')}>
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white p-4 text-center">
                  <div className="text-3xl font-bold">💬</div>
                  <div className="text-sm mt-1 opacity-90">SMS Logs</div>
                </div>
                <div className="bg-indigo-950 text-white text-center py-2 text-xs flex items-center justify-center gap-1">
                  <span>➡</span> More Info
                </div>
              </div>
            </div>

            {/* Device Cards Section */}
            {canDevices && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
                <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">Devices & SIM Balances</span>
                <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
              </div>

              {deviceCards.length === 0 && !loading && (
                <p className="text-center text-gray-400 text-sm py-4">Wax device ah lama helin</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {deviceCards.map((device) => {
                  // Use first SIM's provider color for the card border/accent
                  const mainColors = device.sims.length > 0 ? getProviderColor(device.sims[0].provider_name, device.sims[0].sim_number) : { bg: 'bg-gray-600', dark: 'bg-gray-700', border: 'border-gray-300' };
                  return (
                    <div key={device.device_id} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden text-[11px]">
                      {/* Device Header */}
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-750 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600">
                        <div className="flex items-center gap-1.5">
                          <div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs">📱</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-bold text-gray-900 dark:text-white text-xs truncate">{device.device_name}</span>
                              <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded-full text-[8px] font-semibold ${device.is_online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                <span className={`w-1 h-1 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                                {device.is_online ? 'Live' : 'Off'}
                              </span>
                              {device.battery_level !== null && (
                                <span className="text-[8px] text-yellow-600">🔋{device.battery_level}%</span>
                              )}
                            </div>
                            <div className="text-[8px] text-gray-400 truncate">{formatTimeAgo(device.last_ping)}</div>
                          </div>
                        </div>
                      </div>

                      {/* SIMs - each with shadow, spacing, and provider color */}
                      <div className="p-2 space-y-2">
                        {device.sims.map((sim, si) => {
                          const isHormuud = sim.provider_name.toLowerCase().includes('hormuud');
                          const colors = getProviderColor(sim.provider_name, sim.sim_number);
                          return (
                            <div key={si} className={`rounded-lg border ${colors.border} shadow-sm overflow-hidden`}>
                              {/* SIM colored header bar */}
                              <div className={`${colors.bg} px-2 py-1 flex items-center justify-between`}>
                                <div className="flex items-center gap-1 min-w-0">
                                  {sim.provider_logo && (
                                    <img src={sim.provider_logo} alt="" className="w-4 h-4 rounded-full object-contain bg-white flex-shrink-0" />
                                  )}
                                  <span className="font-semibold text-[10px] text-white truncate">
                                    SIM{sim.sim_slot}: {sim.provider_name}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    setSelectedSimForDelivery({
                                      device_id: device.device_id,
                                      device_name: device.device_name,
                                      sim_slot: sim.sim_slot,
                                      provider_name: sim.provider_name,
                                    });
                                    setManualDeliveryOpen(true);
                                  }}
                                  className="w-5 h-5 rounded-full bg-white/30 text-white flex items-center justify-center flex-shrink-0"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              {/* SIM body */}
                              <div className="bg-white dark:bg-gray-800 px-2 py-1.5">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] text-gray-400">{sim.sim_number}</span>
                                  {sim.evoucher_rate > 0 && (
                                    <span className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-px rounded font-bold">
                                      Rate: {(sim.evoucher_rate * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                {isHormuud ? (
                                  <div className="space-y-0.5 text-[10px]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500">EVC Plus:</span>
                                      <span className="font-bold text-gray-900 dark:text-white">${sim.evc_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500">E-Voucher:</span>
                                      <span className="font-bold text-gray-900 dark:text-white">${sim.evoucher_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-gray-500">Balance:</span>
                                    <span className="font-bold text-gray-900 dark:text-white">${sim.evoucher_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Wadarta Lacagta - Total Balances Summary */}
              {deviceCards.length > 0 && (() => {
                const totalEvoucher = deviceCards.reduce((sum, d) => sum + d.sims.reduce((s, sim) => s + sim.evoucher_balance, 0), 0);
                const totalEvc = deviceCards.reduce((sum, d) => sum + d.sims.reduce((s, sim) => s + sim.evc_balance, 0), 0);
                const totalAll = totalEvoucher + totalEvc;
                return (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-750 rounded-xl border border-blue-200 dark:border-gray-700 p-3 mt-3 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-blue-600 dark:text-blue-400">💰</span>
                      <span className="font-bold text-sm text-gray-900 dark:text-white">Wadarta Lacagta</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-800 p-2 text-center">
                        <div className="text-[9px] text-gray-500 mb-0.5">E-Voucher</div>
                        <div className="font-bold text-green-700 dark:text-green-400 text-sm">${totalEvoucher.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800 p-2 text-center">
                        <div className="text-[9px] text-gray-500 mb-0.5">EVC Plus</div>
                        <div className="font-bold text-gray-900 dark:text-white text-sm">${totalEvc.toFixed(2)}</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700 p-2 text-center">
                        <div className="text-[9px] text-gray-500 mb-0.5">Wadarta Guud</div>
                        <div className="font-bold text-blue-700 dark:text-blue-400 text-sm">${totalAll.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            )}

            {/* Footer with toggles */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setLanguage(isSo ? 'en' : 'so')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium flex-1"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {isSo ? '🇬🇧 English' : '🇸🇴 Soomaali'}
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium"
                >
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-yellow-500" /> : <Moon className="h-3.5 w-3.5 text-blue-500" />}
                  {theme === 'dark' ? (isSo ? 'Nuur' : 'Light') : (isSo ? 'Mugdi' : 'Dark')}
                </button>
              </div>
              {/* Notification Sound/Vibration Toggle */}
              <button
                onClick={toggleNotifications}
                className={`w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  notificationsEnabled
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {notificationsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {notificationsEnabled
                  ? (isSo ? '🔔 Ogeysiisyadu way shidan yihiin' : '🔔 Notifications ON')
                  : (isSo ? '🔕 Ogeysiisyadu way damanyihiin' : '🔕 Notifications OFF')
                }
              </button>
              <div className="text-center text-xs text-gray-400 mt-2">Al-islaam Data Admin v1.0</div>
            </div>
          </main>
        </div>

        {canDevices && selectedSimForDelivery && (
          <AddManualDeliveryDialog
            open={manualDeliveryOpen}
            onOpenChange={(open) => { setManualDeliveryOpen(open); if (!open) setSelectedSimForDelivery(null); }}
            deviceId={selectedSimForDelivery.device_id}
            deviceName={selectedSimForDelivery.device_name}
            simSlot={selectedSimForDelivery.sim_slot}
            providerName={selectedSimForDelivery.provider_name}
            onSuccess={fetchData}
          />
        )}
      </div>
    </SidebarProvider>
  );
};

export default SimpleAdminDashboard;
