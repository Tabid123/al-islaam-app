// @ts-nocheck
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SOURCE_LABELS: Record<string, { label: string; labelSo: string; logo: string; emoji: string }> = {
  tiktok:    { label: 'TikTok',    labelSo: 'TikTok',        logo: 'https://cdn.simpleicons.org/tiktok/000000',           emoji: '🎵' },
  facebook:  { label: 'Facebook',  labelSo: 'Facebook',      logo: 'https://cdn.simpleicons.org/facebook/1877F2',         emoji: '📘' },
  instagram: { label: 'Instagram', labelSo: 'Instagram',     logo: 'https://cdn.simpleicons.org/instagram/E4405F',        emoji: '📸' },
  whatsapp:  { label: 'WhatsApp',  labelSo: 'WhatsApp',      logo: 'https://cdn.simpleicons.org/whatsapp/25D366',         emoji: '💬' },
  youtube:   { label: 'YouTube',   labelSo: 'YouTube',       logo: 'https://cdn.simpleicons.org/youtube/FF0000',          emoji: '▶️' },
  friend:    { label: 'Friend / Family', labelSo: 'Saaxiib / Qoys', logo: '',                                              emoji: '👥' },
  google:    { label: 'Google',    labelSo: 'Google',        logo: 'https://cdn.simpleicons.org/google/4285F4',           emoji: '🔍' },
  other:     { label: 'Other',     labelSo: 'Sabab kale',    logo: '',                                                    emoji: '✍️' },
};

function SourceIcon({ src, emoji, size = 20 }: { src: string; emoji: string; size?: number }) {
  if (!src) return <span style={{ fontSize: size }}>{emoji}</span>;
  return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className="object-contain" />;
}

export function AcquisitionSourcesView({ isSo }: { isSo: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_acquisition_sources')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) console.error(error);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm(isSo ? 'Hubi tirtiridda?' : 'Confirm delete?')) return;
    await supabase.from('user_acquisition_sources').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const counts: Record<string, number> = {};
  rows.forEach((r) => { counts[r.source] = (counts[r.source] || 0) + 1; });
  const total = rows.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isSo ? 'Wadarta jawaabaha' : 'Total responses'}: <span className="font-semibold text-foreground">{total}</span>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {isSo ? 'Cusboonaysii' : 'Refresh'}
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.keys(SOURCE_LABELS).map((key) => {
          const meta = SOURCE_LABELS[key];
          const n = counts[key] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <div key={key} className="bg-white dark:bg-gray-800 border rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SourceIcon src={meta.logo} emoji={meta.emoji} size={18} />
                <span>{isSo ? meta.labelSo : meta.label}</span>
              </div>
              <div className="mt-1 text-2xl font-bold">{n}</div>
              <div className="text-xs text-muted-foreground">{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {isSo ? 'Wax xog ah lama helin.' : 'No responses yet.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 text-left">
              <tr>
                <th className="px-3 py-2">{isSo ? 'Lambar' : 'Phone'}</th>
                <th className="px-3 py-2">{isSo ? 'Ilaha' : 'Source'}</th>
                <th className="px-3 py-2 hidden md:table-cell">{isSo ? 'Faahfaahin' : 'Details'}</th>
                <th className="px-3 py-2">{isSo ? 'Taariikh' : 'Date'}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = SOURCE_LABELS[r.source] || { label: r.source, labelSo: r.source, logo: '', emoji: '❓' };
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.phone_number}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <SourceIcon src={meta.logo} emoji={meta.emoji} size={16} />
                        <span>{isSo ? meta.labelSo : meta.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{r.other_text || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => del(r.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}