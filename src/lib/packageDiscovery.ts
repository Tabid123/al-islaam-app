import { supabase } from '@/integrations/supabase/client';

export async function requestPackageDiscovery(rootId: string, phone: string) {
  const { data, error } = await supabase.rpc('request_package_discovery', {
    p_root_package_id: rootId, p_phone: phone,
  });
  if (error) throw error;
  const result = data as any;
  if (!result?.success || !result?.id) throw new Error(result?.message || 'Baaritaanku ma bilaaban');
  return result;
}

export async function readDiscoveryQueue(id: string) {
  const { data, error } = await supabase.rpc('get_discovery_queue_status', { p_id: id });
  if (error) throw error;
  return data as any;
}

export async function readDiscoveredPackages(id: string) {
  const { data, error } = await supabase.rpc('get_package_discovery', { p_id: id });
  if (error) throw error;
  const result = data as any;
  if (result?.success === false) throw new Error(result.message || 'Codsi lama helin');
  return result;
}

export async function releaseDiscoverySession(id: string) {
  const { error } = await supabase.rpc('release_discovery_session', { p_id: id });
  if (error) throw error;
}
