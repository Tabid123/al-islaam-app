import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

type WaafiActionInput = {
  action: 'status' | 'save' | 'delete';
  merchant_uid?: string;
  api_user_id?: string;
  api_key?: string;
  environment?: 'sandbox' | 'production';
  is_active?: boolean;
};

export const manageWaafiPay = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: WaafiActionInput) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (roleError) throw roleError;
    if (!(roles || []).some((r: any) => r.role === 'super_admin')) {
      throw new Error('super_admin_required');
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    if (data.action === 'status') {
      const [{ data: status, error: statusError }, { data: credentials, error: credentialsError }] = await Promise.all([
        supabaseAdmin.rpc('waafipay_admin_status' as any),
        supabaseAdmin.rpc('waafipay_admin_credentials' as any),
      ]);
      if (statusError) throw statusError;
      if (credentialsError && (status as any)?.configured) throw credentialsError;

      const merchantUid = String((credentials as any)?.merchant_uid || '');
      const apiUserId = String((credentials as any)?.api_user_id || '');
      const apiKey = String((credentials as any)?.api_key || '');
      const configured = (status as any)?.configured === true;
      const credentialsValid =
        !configured ||
        (
          merchantUid.length >= 7 && merchantUid.length <= 15 &&
          apiUserId.length >= 7 && apiUserId.length <= 15 &&
          apiKey.length >= 10 && apiKey.length <= 100
        );

      return {
        success: true,
        integration: { ...(status as any), credentials_valid: credentialsValid },
      };
    }

    if (data.action === 'save') {
      const merchantUid = String(data.merchant_uid || '').trim();
      const apiUserId = String(data.api_user_id || '').trim();
      const apiKey = String(data.api_key || '').trim() || null;

      if (merchantUid.length < 7 || merchantUid.length > 15) {
        throw new Error('Merchant UID-ga waa inuu ahaadaa 7 ilaa 15 xaraf.');
      }
      if (apiUserId.length < 7 || apiUserId.length > 15) {
        throw new Error('API User ID-ga waa inuu ahaadaa 7 ilaa 15 xaraf.');
      }
      if (apiKey && (apiKey.length < 10 || apiKey.length > 100)) {
        throw new Error('API Key-ga buuxa geli.');
      }

      const { data: status, error } = await supabaseAdmin.rpc('waafipay_admin_save' as any, {
        p_merchant_uid: merchantUid,
        p_api_user_id: apiUserId,
        p_api_key: apiKey,
        p_environment: data.environment === 'sandbox' ? 'sandbox' : 'production',
        p_is_active: data.is_active === true,
      });
      if (error) throw error;

      return { success: true, integration: status as any };
    }

    if (data.action === 'delete') {
      const { data: status, error } = await supabaseAdmin.rpc('waafipay_admin_delete' as any);
      if (error) throw error;
      return { success: true, integration: status as any };
    }

    throw new Error('unknown_action');
  });
