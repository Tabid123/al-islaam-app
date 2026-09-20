import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ProviderResponseMessage = {
  id: string;
  provider_name: string;
  message_so: string | null;
  message_en: string | null;
  is_active: boolean;
};

let cache: ProviderResponseMessage[] | null = null;
let inflight: Promise<ProviderResponseMessage[]> | null = null;

async function fetchMessages(): Promise<ProviderResponseMessage[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase
        .from('provider_response_messages')
        .select('id, provider_name, message_so, message_en, is_active')
        .eq('is_active', true);
      const rows = (data as ProviderResponseMessage[]) || [];
      cache = rows;
      inflight = null;
      return rows;
    })();
  }
  return inflight;
}

export function clearProviderMessagesCache() {
  cache = null;
  inflight = null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z\u00c0-\u024f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Returns the configured provider message that matches a raw delivery note /
 * provider response, or null when nothing matches.
 */
export function matchProviderMessage(
  note: string | null | undefined,
  messages: ProviderResponseMessage[],
  isSo: boolean,
): { providerName: string; text: string } | null {
  if (!note) return null;
  const n = normalize(note);
  if (n.length < 6) return null;

  for (const m of messages) {
    for (const candidate of [m.message_so, m.message_en]) {
      if (!candidate) continue;
      const c = normalize(candidate);
      if (c.length < 8) continue;
      if (n.includes(c) || c.includes(n)) {
        const text = (isSo ? m.message_so : m.message_en) || m.message_so || m.message_en || candidate;
        return { providerName: m.provider_name, text };
      }
    }
  }
  return null;
}

export function useProviderResponseMessages() {
  const [messages, setMessages] = useState<ProviderResponseMessage[]>(cache || []);

  useEffect(() => {
    let active = true;
    fetchMessages().then((m) => {
      if (active) setMessages(m);
    });
    return () => {
      active = false;
    };
  }, []);

  return messages;
}
