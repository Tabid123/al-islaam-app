import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_WHATSAPP = '252615555495';
const DEFAULT_CALL = '252615555495';

export interface SupportContacts {
  whatsapp: string;
  call: string;
  whatsappUrl: string;
  callUrl: string;
}

export function useSupportContacts(): SupportContacts {
  const { data } = useQuery({
    queryKey: ['supportContacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, text_value')
        .in('setting_key', ['support_whatsapp_number', 'support_call_number']);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        if (r.text_value) map[r.setting_key] = String(r.text_value).trim();
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  const whatsapp = (data?.support_whatsapp_number || DEFAULT_WHATSAPP).replace(/\D/g, '');
  const call = (data?.support_call_number || DEFAULT_CALL).replace(/\D/g, '');

  return {
    whatsapp,
    call,
    whatsappUrl: `https://wa.me/${whatsapp}`,
    callUrl: `tel:+${call}`,
  };
}