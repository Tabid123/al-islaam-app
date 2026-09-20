import { useState, useEffect, Suspense, lazy } from 'react';

// Retry dynamic imports once (stale chunks after a rebuild cause
// "Failed to fetch dynamically imported module" and a blank screen)
const lazyRetry = <T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>
) =>
  lazy(() =>
    factory().catch(async (err) => {
      await new Promise((r) => setTimeout(r, 300));
      try {
        return await factory();
      } catch {
        window.location.reload();
        throw err;
      }
    })
  );
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { SimpleAdminSidebar } from '@/components/admin/SimpleAdminSidebar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ArrowLeft, Menu, Globe, Moon, Sun, Loader2 } from 'lucide-react';
import riyokaabLogo from '@/assets/riyokaab-logo.jpeg';
import { useAdminPermissions, DETAIL_PERMISSIONS } from '@/hooks/useAdminPermissions';

// Lazy-loaded custom views (code-split per view)
const DailyOrdersCustomView = lazyRetry(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.DailyOrdersCustomView })));
const OrdersListView = lazyRetry(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.OrdersListView })));
const AutoTopUpCustomView = lazyRetry(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.AutoTopUpCustomView })));
const ScheduledOrdersView = lazyRetry(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.ScheduledOrdersView })));
const ReferralsView = lazyRetry(() => import('@/components/admin/simple/ReferralsView').then(m => ({ default: m.ReferralsView })));
const AcquisitionSourcesView = lazyRetry(() => import('@/components/admin/simple/AcquisitionSourcesView').then(m => ({ default: m.AcquisitionSourcesView })));
const AbdiqafarView = lazyRetry(() => import('@/components/admin/simple/AbdiqafarView').then(m => ({ default: m.AbdiqafarView })));
const CustomersCustomView = lazyRetry(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.CustomersCustomView })));
const OfflineRegistrationsCustomView = lazyRetry(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.OfflineRegistrationsCustomView })));
const DevicesCustomView = lazyRetry(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.DevicesCustomView })));
const BlockedCustomView = lazyRetry(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.BlockedCustomView })));
const ProvidersCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.ProvidersCustomView })));
const PackagesCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.PackagesCustomView })));
const CategoriesCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.CategoriesCustomView })));
const FeaturedCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.FeaturedCustomView })));
const BannersCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.BannersCustomView })));
const PaymentSettingsCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.PaymentSettingsCustomView })));
const SystemCodesCustomView = lazyRetry(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.SystemCodesCustomView })));
const AppsView = lazyRetry(() => import('@/components/admin/simple/AppsView').then(m => ({ default: m.AppsView })));
const SomlinkManualView = lazyRetry(() => import('@/components/admin/simple/SomlinkManualView').then(m => ({ default: m.SomlinkManualView })));
const UssdView = lazyRetry(() => import('@/components/admin/simple/UssdView').then(m => ({ default: m.UssdView })));
const DiscoveryCatalogView = lazyRetry(() => import('@/components/admin/simple/DiscoveryCatalogView'));
const ReportsView = lazyRetry(() => import('@/components/admin/simple/ReportsView').then(m => ({ default: m.ReportsView })));

// Lazy-loaded full admin components
const TransactionsDashboard = lazyRetry(() => import('@/components/admin/TransactionsDashboard').then(m => ({ default: m.TransactionsDashboard })));
const CombinedPaymentAnalytics = lazyRetry(() => import('@/components/admin/CombinedPaymentAnalytics'));
const OnlinePaymentsDashboard = lazyRetry(() => import('@/components/admin/OnlinePaymentsDashboard').then(m => ({ default: m.OnlinePaymentsDashboard })));
const SMSOfflineOrdersDashboard = lazyRetry(() => import('@/components/admin/SMSOfflineOrdersDashboard').then(m => ({ default: m.SMSOfflineOrdersDashboard })));
const UnmatchedPayments = lazyRetry(() => import('@/components/admin/UnmatchedPayments'));
const CompanyFinances = lazyRetry(() => import('@/components/admin/CompanyFinances').then(m => ({ default: m.CompanyFinances })));
const DailyOrdersManager = lazyRetry(() => import('@/components/admin/DailyOrdersManager').then(m => ({ default: m.DailyOrdersManager })));
const BlockedUsersManager = lazyRetry(() => import('@/components/admin/BlockedUsersManager').then(m => ({ default: m.BlockedUsersManager })));
const BulkSmsManager = lazyRetry(() => import('@/components/admin/BulkSmsManager').then(m => ({ default: m.BulkSmsManager })));
const SendNotification = lazyRetry(() => import('@/components/admin/SendNotification').then(m => ({ default: m.SendNotification })));
const AppSettings = lazyRetry(() => import('@/components/admin/AppSettings'));
const OfflinePaymentSettings = lazyRetry(() => import('@/components/admin/OfflinePaymentSettings'));

const AutoTopUpSettings = lazyRetry(() => import('@/components/admin/AutoTopUpSettings').then(m => ({ default: m.AutoTopUpSettings })));
const AuditLogViewer = lazyRetry(() => import('@/components/admin/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));
const AdminManagement = lazyRetry(() => import('@/components/admin/AdminManagement').then(m => ({ default: m.AdminManagement })));
const FraudAlerts = lazyRetry(() => import('@/components/admin/FraudAlerts').then(m => ({ default: m.FraudAlerts })));
const PackageDeliveryRules = lazyRetry(() => import('@/components/admin/PackageDeliveryRules').then(m => ({ default: m.PackageDeliveryRules })));
const BalanceManagement = lazyRetry(() => import('@/components/admin/BalanceManagement').then(m => ({ default: m.BalanceManagement })));
const PaymentSmsLog = lazyRetry(() => import('@/components/admin/PaymentSmsLog').then(m => ({ default: m.PaymentSmsLog })));
const SmsLacagoCards = lazyRetry(() => import('@/components/admin/SmsLacagoCards').then(m => ({ default: m.SmsLacagoCards })));
const SmsLogsViewer = lazyRetry(() => import('@/components/admin/SmsLogsViewer'));
const DeliveryTracker = lazyRetry(() => import('@/components/admin/DeliveryTracker').then(m => ({ default: m.DeliveryTracker })));
const BankTransactions = lazyRetry(() => import('@/components/admin/BankTransactions').then(m => ({ default: m.BankTransactions })));

interface DetailConfig {
  title: string;
  titleSo: string;
  headerBg: string;
}

const DETAIL_CONFIGS: Record<string, DetailConfig> = {
  customers: { title: 'Customers', titleSo: 'Macaamiisha', headerBg: 'from-teal-500 to-teal-700' },
  'offline-registrations': { title: 'Offline Registrations', titleSo: 'Offline Reg', headerBg: 'from-orange-500 to-orange-700' },
  'auto-topup': { title: 'Auto Top-Up', titleSo: 'Auto Top-Up', headerBg: 'from-lime-500 to-lime-700' },
  'daily-orders': { title: 'Daily Orders', titleSo: 'Dalabyada Maalinta', headerBg: 'from-indigo-600 to-indigo-800' },
  sales: { title: "Today's Sales", titleSo: 'Iibka Maanta', headerBg: 'from-green-500 to-green-700' },
  failed: { title: 'Failed Orders', titleSo: 'Guul Darro', headerBg: 'from-red-500 to-red-700' },
  pending: { title: 'Pending Orders', titleSo: 'Sugaya', headerBg: 'from-blue-500 to-blue-700' },
  delivered: { title: 'Delivered', titleSo: 'Dhameystiran', headerBg: 'from-pink-500 to-pink-700' },
  'all-orders': { title: 'All Orders', titleSo: 'Dhammaan Orders', headerBg: 'from-indigo-500 to-indigo-700' },
  devices: { title: 'Devices', titleSo: 'Aaladaha', headerBg: 'from-yellow-500 to-yellow-700' },
  blocked: { title: 'Blocked Users', titleSo: 'Block Users', headerBg: 'from-gray-600 to-gray-800' },
  providers: { title: 'Providers', titleSo: 'Shirkadaha', headerBg: 'from-purple-500 to-purple-700' },
  packages: { title: 'Packages', titleSo: 'Packages', headerBg: 'from-cyan-500 to-cyan-700' },
  categories: { title: 'Categories', titleSo: 'Categories', headerBg: 'from-emerald-500 to-emerald-700' },
  featured: { title: 'Featured', titleSo: 'Featured', headerBg: 'from-amber-500 to-amber-700' },
  banners: { title: 'Banners', titleSo: 'Banners', headerBg: 'from-rose-500 to-rose-700' },
  'payment-settings': { title: 'Payment Providers', titleSo: 'Payment Settings', headerBg: 'from-violet-500 to-violet-700' },
  'system-codes': { title: 'System Codes', titleSo: 'USSD Codes', headerBg: 'from-indigo-600 to-indigo-800' },
  apps: { title: 'Apps', titleSo: 'Apps', headerBg: 'from-green-600 to-green-800' },
  'somlink-manual': { title: 'Somlink Manual Send', titleSo: 'Somlink Dir Manual', headerBg: 'from-green-600 to-green-800' },
  'discovery-catalog': { title: 'Discovery Prices', titleSo: 'Qiimaha Baarista', headerBg: 'from-sky-600 to-sky-800' },
  ussd: { title: 'USSD Service', titleSo: 'USSD', headerBg: 'from-sky-600 to-sky-800' },
  reports: { title: 'Reports', titleSo: 'Warbixinno', headerBg: 'from-green-600 to-green-800' },
  transactions: { title: 'Transactions', titleSo: 'Transactions', headerBg: 'from-blue-600 to-blue-800' },
  'sms-lacago': { title: 'SMS Lacago', titleSo: 'SMS Lacago', headerBg: 'from-orange-600 to-orange-800' },
  'evoucher-rates': { title: 'E-Voucher Rates', titleSo: 'E-Voucher Rates', headerBg: 'from-emerald-600 to-emerald-800' },
  'bulk-sms': { title: 'Bulk SMS', titleSo: 'Bulk SMS', headerBg: 'from-teal-600 to-teal-800' },
  'send-notification': { title: 'Notifications', titleSo: 'Farriin Dir', headerBg: 'from-blue-600 to-blue-800' },
  'app-settings': { title: 'App Settings', titleSo: 'Settings', headerBg: 'from-gray-600 to-gray-800' },
  'offline-payment': { title: 'Offline Payment', titleSo: 'Offline Payment', headerBg: 'from-amber-600 to-amber-800' },
  
  'delivery-rules': { title: 'Bundling Rules', titleSo: 'Xirmooyin', headerBg: 'from-pink-600 to-pink-800' },
  'admin-management': { title: 'Admin Management', titleSo: 'Admins', headerBg: 'from-slate-600 to-slate-800' },
  'audit-log': { title: 'Audit Log', titleSo: 'Taariikhda', headerBg: 'from-zinc-600 to-zinc-800' },
  'fraud-alerts': { title: 'Fraud Alerts', titleSo: 'Fraud Alerts', headerBg: 'from-red-600 to-red-800' },
  'deliveries': { title: 'Deliveries', titleSo: 'Deliveries', headerBg: 'from-green-600 to-green-800' },
  'abdiqafar': { title: 'Orders', titleSo: 'Orders', headerBg: 'from-green-700 to-green-500' },
  'scheduled-orders': { title: 'Scheduled Orders', titleSo: 'Dalabyo Qorsheysan', headerBg: 'from-indigo-600 to-indigo-800' },
  'referrals': { title: 'Referrals', titleSo: 'Referrals', headerBg: 'from-fuchsia-600 to-fuchsia-800' },
  'acquisition-sources': { title: 'Acquisition Sources', titleSo: 'Halkee Nooga Yimaadeen', headerBg: 'from-sky-600 to-sky-800' },
  'unmatched': { title: 'Unmatched Payments', titleSo: 'Lacago La Heli Waayay', headerBg: 'from-red-600 to-red-800' },
  'sms-logs': { title: 'SMS Logs', titleSo: 'SMS', headerBg: 'from-indigo-600 to-indigo-800' },
  'bank-transactions': { title: 'Bank Transactions', titleSo: 'Lacagaha Bank-ka', headerBg: 'from-emerald-600 to-emerald-800' },
};

const LazyFallback = () => (
  <div className="flex justify-center items-center py-16">
    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
  </div>
);

const SimpleAdminDetail = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const config = DETAIL_CONFIGS[type || ''] || DETAIL_CONFIGS.customers;
  const isSo = language === 'so';
  const { can, loading: permLoading } = useAdminPermissions();
  const allowed = can(DETAIL_PERMISSIONS[type || '']);

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

  const renderView = () => {
    if (permLoading) return <LazyFallback />;
    if (!allowed) {
      return (
        <div className="text-center py-16 px-6">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-gray-700 dark:text-gray-200 font-semibold">
            {isSo ? 'Ma lihid fasax qeybtan' : 'You do not have access to this section'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {isSo ? 'La xiriir super admin-ka' : 'Contact your super admin'}
          </p>
        </div>
      );
    }
    switch (type) {
      // Custom views (lazy-loaded)
      case 'daily-orders': return <DailyOrdersCustomView isSo={isSo} />;
      case 'customers': return <CustomersCustomView isSo={isSo} />;
      case 'offline-registrations': return <OfflineRegistrationsCustomView isSo={isSo} />;
      case 'auto-topup': return <AutoTopUpCustomView isSo={isSo} />;
      case 'scheduled-orders': return <ScheduledOrdersView isSo={isSo} />;
      case 'referrals': return <ReferralsView isSo={isSo} />;
      case 'acquisition-sources': return <AcquisitionSourcesView isSo={isSo} />;
      case 'sales': case 'failed': case 'pending': case 'delivered': case 'all-orders':
        return <OrdersListView isSo={isSo} type={type!} />;
      case 'devices': return <DevicesCustomView isSo={isSo} />;
      case 'blocked': return <BlockedCustomView isSo={isSo} />;
      case 'providers': return <ProvidersCustomView isSo={isSo} />;
      case 'packages': return <PackagesCustomView isSo={isSo} />;
      case 'categories': return <CategoriesCustomView isSo={isSo} />;
      case 'featured': return <FeaturedCustomView isSo={isSo} />;
      case 'banners': return <BannersCustomView isSo={isSo} />;
      case 'payment-settings': return <PaymentSettingsCustomView isSo={isSo} />;
      case 'system-codes': return <SystemCodesCustomView isSo={isSo} />;
      case 'apps': return <AppsView isSo={isSo} />;
      case 'somlink-manual': return <SomlinkManualView isSo={isSo} />;
      case 'ussd': return <UssdView isSo={isSo} />;
      case 'discovery-catalog': return <DiscoveryCatalogView isSo={isSo} />;
      case 'reports': return <ReportsView isSo={isSo} />;
      // Full admin components (lazy-loaded)
      case 'transactions': return <TransactionsDashboard />;
      case 'sms-lacago': return <SmsLacagoCards />;
      case 'evoucher-rates': return <CompanyFinances />;
      case 'bulk-sms': return <BulkSmsManager />;
      case 'send-notification': return <SendNotification />;
      case 'app-settings': return <AppSettings />;
      case 'offline-payment': return <OfflinePaymentSettings />;
      
      case 'delivery-rules': return <PackageDeliveryRules />;
      case 'admin-management': return <AdminManagement />;
      case 'audit-log': return <AuditLogViewer />;
      case 'fraud-alerts': return <FraudAlerts />;
      case 'deliveries': return <DeliveryTracker />;
      case 'abdiqafar': return <AbdiqafarView isSo={isSo} />;
      case 'unmatched': return <UnmatchedPayments />;
      case 'sms-logs': return <SmsLogsViewer />;
      case 'bank-transactions': return <BankTransactions isSo={isSo} />;
      default: return <LazyFallback />;
    }
  };

  const title = isSo ? config.titleSo : config.title;

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gray-100 dark:bg-gray-900">
        <SimpleAdminSidebar />
        <div className="flex-1 flex flex-col w-full">
          <header className={`bg-gradient-to-r ${config.headerBg} text-white`}>
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => navigate('/simple-admin')} className="p-1.5 rounded-full hover:bg-white/20">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <img src={riyokaabLogo} alt="Logo" className="w-7 h-7 rounded-lg" />
                <h1 className="text-lg font-bold">{title}</h1>
              </div>
              <div className="w-8" />
            </div>
            <div className="bg-black/10 px-4 py-2 flex items-center justify-between text-sm">
              <SidebarTrigger className="text-white hover:bg-white/20">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <span className="text-[11px] opacity-70">Full Capabilities</span>
            </div>
          </header>

          <main className="flex-1 px-3 py-4 space-y-2">
            <Suspense fallback={<LazyFallback />}>
              {renderView()}
            </Suspense>
          </main>

          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between gap-1.5">
              <button onClick={() => setLanguage(isSo ? 'en' : 'so')} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium">
                <Globe className="h-3 w-3" />{isSo ? '🇬🇧 EN' : '🇸🇴 SO'}
              </button>
              <span className="text-[10px] text-gray-400">Riyokaab Data v1.0</span>
              <button onClick={toggleTheme} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium">
                {theme === 'dark' ? <Sun className="h-3 w-3 text-yellow-500" /> : <Moon className="h-3 w-3 text-blue-500" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SimpleAdminDetail;
