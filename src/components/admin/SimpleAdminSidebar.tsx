import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard, Bell, ShoppingCart, ChevronDown, ChevronRight,
  Users, MessageSquare, Smartphone, Settings, LogOut, Ban, Clock,
  XCircle, ListOrdered, History, Send, Megaphone, CreditCard,
  BarChart3, AlertTriangle, Wallet, Package, Briefcase, Grid3x3,
  Star, Layers, Zap, ImageIcon, WifiOff, ShieldCheck, FileText,
  Receipt, Moon, Sun, Globe, Banknote, TrendingUp,
} from 'lucide-react';
import alIslaamLogo from '@/assets/al-islaam-logo.png';
import { useAdminPermissions, DETAIL_PERMISSIONS } from '@/hooks/useAdminPermissions';

interface MenuItem {
  label: string;
  labelSo: string;
  icon: React.ElementType;
  path?: string;
  children?: MenuItem[];
}

const menuGroups: MenuItem[] = [
  { label: 'Dashboard', labelSo: 'Dashboard', icon: LayoutDashboard, path: '/simple-admin' },
  {
    label: 'Payments & Analytics', labelSo: 'Lacagaha & Falanqayn', icon: BarChart3,
    children: [
      { label: 'Transactions', labelSo: 'Transactions', icon: Receipt, path: '/simple-admin/transactions' },
      { label: 'Reports', labelSo: 'Warbixinno', icon: BarChart3, path: '/simple-admin/reports' },
      { label: 'SMS Lacago', labelSo: 'SMS Lacago', icon: MessageSquare, path: '/simple-admin/sms-lacago' },
      { label: 'Bank Transactions', labelSo: 'Lacagaha Bank-ka', icon: Banknote, path: '/simple-admin/bank-transactions' },
      { label: 'Unmatched', labelSo: 'Lacago La Heli Waayay', icon: AlertTriangle, path: '/simple-admin/unmatched' },
      { label: 'E-Voucher Rates', labelSo: 'E-Voucher Rates', icon: Wallet, path: '/simple-admin/evoucher-rates' },
    ],
  },
  {
    label: 'Orders', labelSo: 'Dalabyo', icon: ShoppingCart,
    children: [
      { label: 'Daily Orders', labelSo: 'Dalabyada Maalinta', icon: Clock, path: '/simple-admin/daily-orders' },
      { label: 'Orders', labelSo: 'Orders', icon: FileText, path: '/simple-admin/abdiqafar' },
      { label: 'Scheduled Orders', labelSo: 'Dalabyo Qorsheysan', icon: Clock, path: '/simple-admin/scheduled-orders' },
      { label: 'All Orders', labelSo: 'Dhammaan Orders', icon: ListOrdered, path: '/simple-admin/all-orders' },
      { label: 'Processing', labelSo: 'Sugaya', icon: Clock, path: '/simple-admin/pending' },
      { label: 'Failed', labelSo: 'Guul Darro', icon: XCircle, path: '/simple-admin/failed' },
      { label: 'Delivered', labelSo: 'Dhameystiran', icon: History, path: '/simple-admin/delivered' },
    ],
  },
  {
    label: 'Customers', labelSo: 'Macaamiisha', icon: Users,
    children: [
      { label: 'Users', labelSo: 'Macaamiisha', icon: Users, path: '/simple-admin/customers' },
      { label: 'Offline Registrations', labelSo: 'Offline Reg', icon: WifiOff, path: '/simple-admin/offline-registrations' },
      { label: 'Blocked Users', labelSo: 'Block Users', icon: Ban, path: '/simple-admin/blocked' },
      { label: 'Referrals', labelSo: 'Referrals', icon: Star, path: '/simple-admin/referrals' },
      { label: 'Acquisition Sources', labelSo: 'Halkee Nooga Yimaadeen', icon: TrendingUp, path: '/simple-admin/acquisition-sources' },
    ],
  },
  {
    label: 'Products', labelSo: 'Badeecadaha', icon: Package,
    children: [
      { label: 'Providers', labelSo: 'Shirkadaha', icon: Briefcase, path: '/simple-admin/providers' },
      { label: 'Packages', labelSo: 'Packages', icon: Package, path: '/simple-admin/packages' },
      { label: 'Categories', labelSo: 'Categories', icon: Grid3x3, path: '/simple-admin/categories' },
      { label: 'Featured', labelSo: 'Featured', icon: Star, path: '/simple-admin/featured' },
      { label: 'Bundling Rules', labelSo: 'Xirmooyin', icon: Layers, path: '/simple-admin/delivery-rules' },
      { label: 'System Codes', labelSo: 'USSD Codes', icon: Layers, path: '/simple-admin/system-codes' },
    ],
  },
  {
    label: 'Devices & Delivery', labelSo: 'Aaladaha & Delivery', icon: Smartphone,
    children: [
      { label: 'Devices', labelSo: 'Devices', icon: Smartphone, path: '/simple-admin/devices' },
      { label: 'SMS', labelSo: 'SMS', icon: MessageSquare, path: '/simple-admin/sms-logs' },
      { label: 'Auto Top-Up', labelSo: 'Auto Top-Up', icon: Zap, path: '/simple-admin/auto-topup' },
      { label: 'Deliveries', labelSo: 'Deliveries', icon: Smartphone, path: '/simple-admin/deliveries' },
      { label: 'USSD Service', labelSo: 'USSD', icon: MessageSquare, path: '/simple-admin/ussd' },
      { label: 'Discovery Prices', labelSo: 'Qiimaha Baarista', icon: Layers, path: '/simple-admin/discovery-catalog' },
    ],
  },
  {
    label: 'Communication', labelSo: 'Xiriirka', icon: Send,
    children: [
      { label: 'Send Notification', labelSo: 'Farriin Dir', icon: Bell, path: '/simple-admin/send-notification' },
      { label: 'Bulk SMS', labelSo: 'Bulk SMS', icon: Megaphone, path: '/simple-admin/bulk-sms' },
    ],
  },
  {
    label: 'Settings', labelSo: 'Settings', icon: Settings,
    children: [
      { label: 'Payment Settings', labelSo: 'Payment', icon: CreditCard, path: '/simple-admin/payment-settings' },
      { label: 'WaafiPay API', labelSo: 'WaafiPay API', icon: ShieldCheck, path: '/simple-admin/waafipay-api' },
      { label: 'Offline Payment', labelSo: 'Offline Payment', icon: WifiOff, path: '/simple-admin/offline-payment' },
      
      { label: 'Banners', labelSo: 'Banners', icon: ImageIcon, path: '/simple-admin/banners' },
      { label: 'App Settings', labelSo: 'Settings', icon: Settings, path: '/simple-admin/app-settings' },
      { label: 'Somlink Manual Send', labelSo: 'Somlink Dir Manual', icon: Zap, path: '/simple-admin/somlink-manual' },
      { label: 'Apps', labelSo: 'Apps', icon: Smartphone, path: '/simple-admin/apps' },
    ],
  },
  {
    label: 'Security & Admin', labelSo: 'Amniga & Admin', icon: ShieldCheck,
    children: [
      { label: 'Admin Management', labelSo: 'Admins', icon: Users, path: '/simple-admin/admin-management' },
      { label: 'Audit Log', labelSo: 'Taariikhda', icon: FileText, path: '/simple-admin/audit-log' },
      { label: 'Fraud Alerts', labelSo: 'Fraud Alerts', icon: AlertTriangle, path: '/simple-admin/fraud-alerts' },
    ],
  },
];

export function SimpleAdminSidebar() {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const { can, isSuperAdmin } = useAdminPermissions();

  const allowedItem = (item: MenuItem) => {
    if (!item.path) return true;
    const slug = item.path.replace('/simple-admin', '').replace(/^\//, '');
    if (!slug) return true; // dashboard
    if (slug === 'waafipay-api') return isSuperAdmin;
    const perm = DETAIL_PERMISSIONS[slug];
    return can(perm);
  };

  const visibleGroups = menuGroups
    .map((g) => (g.children ? { ...g, children: g.children.filter(allowedItem) } : g))
    .filter((g) => (g.children ? g.children.length > 0 : allowedItem(g)));

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNav = (path?: string) => {
    if (path) {
      navigate(path);
      setOpenMobile(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('adminEmergencySession');
    localStorage.removeItem('adminEmergencyTime');
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const isSo = language === 'so';

  return (
    <Sidebar collapsible="offcanvas" className="bg-gray-900 dark:bg-gray-950 border-none">
      <SidebarHeader className="bg-gray-900 dark:bg-gray-950 border-b border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <img src={alIslaamLogo} alt="Logo" className="w-12 h-12 rounded-full border-2 border-blue-400" />
          <div>
            <div className="text-white font-semibold text-base">Al-islaam Data</div>
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              Owner
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-gray-900 dark:bg-gray-950 text-gray-300">
        <SidebarMenu className="p-2 space-y-0.5">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => group.children ? toggleGroup(group.label) : handleNav(group.path)}
                  className="flex items-center justify-between w-full px-3 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <group.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{isSo ? group.labelSo : group.label}</span>
                  </div>
                  {group.children && (
                    openGroups[group.label]
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {group.children && openGroups[group.label] && (
                <div className="ml-6 border-l border-gray-700 pl-3 space-y-0.5">
                  {group.children.map((child) => (
                    <SidebarMenuItem key={child.label}>
                      <SidebarMenuButton
                        onClick={() => handleNav(child.path)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        <child.icon className="h-4 w-4" />
                        <span>{isSo ? child.labelSo : child.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="my-3 border-t border-gray-700" />

          {/* Logout */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm">{isSo ? 'Ka bax' : 'Logout'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      {/* Footer: Language + Dark Mode */}
      <SidebarFooter className="bg-gray-900 dark:bg-gray-950 border-t border-gray-700 p-3">
        <div className="flex items-center justify-between gap-2">
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(isSo ? 'en' : 'so')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors flex-1"
          >
            <Globe className="h-4 w-4" />
            <span>{isSo ? '🇬🇧 English' : '🇸🇴 Soomaali'}</span>
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
            <span>{theme === 'dark' ? (isSo ? 'Nuur' : 'Light') : (isSo ? 'Mugdi' : 'Dark')}</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
