import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, Smartphone, Upload } from 'lucide-react';
import { toast } from 'sonner';

type AppRelease = {
  id: string;
  app_key: string;
  app_name: string;
  version: string;
  release_notes: string | null;
  file_path: string;
  file_size: number;
  is_current: boolean;
  created_at: string;
};

const APP_KEY = 'al_islaam_delivery';
const BUCKET = 'app-releases';

const formatBytes = (bytes: number) => {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
};

const AppReleasesManager = () => {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ['appReleases', APP_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_releases')
        .select('*')
        .eq('app_key', APP_KEY)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AppRelease[];
    },
  });

  const current = useMemo(() => releases.find((r) => r.is_current) || releases[0], [releases]);

  const getDownloadUrl = async (release: AppRelease) => {
    if (/^https?:\/\//i.test(release.file_path)) {
      window.open(release.file_path, '_blank', 'noopener,noreferrer');
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(release.file_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'APK download link lama samayn karin');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !version.trim()) throw new Error('Dooro APK-ga oo geli version-ka.');
      if (!file.name.toLowerCase().endsWith('.apk')) throw new Error('File-ku waa inuu APK yahay.');

      const safeVersion = version.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${APP_KEY}/${Date.now()}-${safeVersion}.apk`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: 'application/vnd.android.package-archive',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: uncurrentError } = await supabase
        .from('app_releases')
        .update({ is_current: false })
        .eq('app_key', APP_KEY)
        .eq('is_current', true);
      if (uncurrentError) throw uncurrentError;

      const { error: insertError } = await supabase.from('app_releases').insert({
        app_key: APP_KEY,
        app_name: 'Al-islaam Delivery',
        version: version.trim(),
        release_notes: notes.trim() || null,
        file_path: path,
        file_size: file.size,
        is_current: true,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appReleases', APP_KEY] });
      setFile(null);
      setVersion('');
      setNotes('');
      toast.success('APK-ga cusub Apps tab-ka waa lagu daray.');
    },
    onError: (error: any) => toast.error(error?.message || 'APK upload-ku wuu fashilmay'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Apps</h2>
        <p className="text-muted-foreground">Al-islaam Delivery APK releases ka maamul halkan.</p>
      </div>

      {current && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-3"><Smartphone className="h-6 w-6 text-primary" /></div>
                <div>
                  <CardTitle>{current.app_name}</CardTitle>
                  <CardDescription>Version {current.version} · {formatBytes(current.file_size)}</CardDescription>
                </div>
              </div>
              <Badge>Current</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {current.release_notes && <p className="text-sm text-muted-foreground">{current.release_notes}</p>}
            <Button onClick={() => getDownloadUrl(current)}>
              <Download className="mr-2 h-4 w-4" /> Download APK
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>APK cusub geli</CardTitle>
          <CardDescription>APK cusub upload garee; kii hore history-ga ayuu ku sii jirayaa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Version</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Tusaale: 1.0.46" />
            </div>
            <div className="space-y-2">
              <Label>APK file</Label>
              <Input type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Release notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Waxa lagu saxay build-kan..." />
          </div>
          <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !file || !version.trim()}>
            {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload APK
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Release history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Weli APK release ma jiro.</p>
          ) : releases.map((release) => (
            <div key={release.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{release.app_name} · {release.version}</p>
                  {release.is_current && <Badge variant="secondary">Current</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{formatBytes(release.file_size)} · {new Date(release.created_at).toLocaleString()}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => getDownloadUrl(release)}>
                <Download className="mr-2 h-4 w-4" /> APK
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AppReleasesManager;
