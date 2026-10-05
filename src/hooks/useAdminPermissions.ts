import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const DETAIL_PERMISSIONS: Record<string, string> = {
  transactions: 'view_transactions',
  reports: 'view_transactions',
  'sms-lacago': 'view_transactions',
  'bank-transactions': 'view_transactions',
  'evoucher-rates': 'view_transactions',
  unmatched: 'manage_orders',

  'daily-orders': 'manage_orders',
  abdiqafar: 'manage_orders',
  'scheduled-orders': 'manage_orders',
  'all-orders': 'manage_orders',
  pending: 'manage_orders',
  failed: 'manage_orders',
  delivered: 'manage_orders',
  sales: 'manage_orders',
  deliveries: 'manage_orders',

  customers: 'manage_users',
  'offline-registrations': 'manage_users',
  blocked: 'manage_users',
  referrals: 'manage_users',
  'acquisition-sources': 'manage_users',

  providers: 'manage_providers',
  packages: 'manage_packages',
  categories: 'manage_packages',
  featured: 'manage_packages',
  'delivery-rules': 'manage_packages',
  'system-codes': 'manage_packages',
  'discovery-catalog': 'manage_packages',

  devices: 'manage_devices',
  'sms-logs': 'manage_devices',
  ussd: 'manage_devices',

  'auto-topup': 'manage_settings',
  'send-notification': 'manage_settings',
  'bulk-sms': 'manage_bulk_sms',
  'payment-settings': 'manage_settings',
  'offline-payment': 'manage_settings',
  banners: 'manage_settings',
  'app-settings': 'manage_settings',
  apps: 'manage_settings',
  'somlink-manual': 'manage_settings',
  'waafipay-api': 'manage_settings',
  'edahab-api': 'manage_settings',

  'admin-management': 'manage_admins',
  'audit-log': 'view_audit_log',
  'fraud-alerts': 'view_audit_log',
};

export interface AdminPermissionsState {
  loading: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  /** No explicit permission rows => full access (legacy behaviour) */
  hasFullAccess: boolean;
  can: (permission?: string) => boolean;
}

export function useAdminPermissions(): AdminPermissionsState {
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_my_admin_context' as any);
        if (!active) return;
        const ctx: any = data || {};
        const roles = Array.isArray(ctx.roles) ? ctx.roles : [];
        setIsSuperAdmin(ctx.is_super_admin === true || roles.includes('super_admin'));
        setPermissions(Array.isArray(ctx.permissions) ? ctx.permissions : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const hasFullAccess = isSuperAdmin || permissions.length === 0;

  const can = (permission?: string) => {
    if (!permission) return true;
    if (hasFullAccess) return true;
    return permissions.includes(permission);
  };

  return { loading, isSuperAdmin, permissions, hasFullAccess, can };
}
