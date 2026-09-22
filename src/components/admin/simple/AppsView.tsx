import { useEffect, useRef, useState } from 'react';
import { Download, Smartphone, Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Release {
  id: string;
  app_key: string;
  app_name: string;
  version: string;
  release_notes: string | null;
  file_path: string;
  file_size: number;
  created_at: string;
}

export function AppsView({ isSo }: { isSo: boolean }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const appName = 'Al-islaam Delivery';
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_releases')
      .select('*')
      .order('created_at', { ascending: false });
    setReleases((data as Release[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDownload = async (r: Release) => {
    const { data, error } = await supabase.storage
      .from('app-releases')
      .createSignedUrl(r.file_path, 300, { download: true });
    if (error || !data) { toast.error(error?.message || 'Download failed'); return; }
    window.location.href = data.signedUrl;
  };

  const uploadWithProgress = (url: string, file: File) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/vnd.android.package-archive');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(file);
    });

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error(isSo ? 'APK dooro' : 'Choose an APK'); return; }
    if (!version.trim()) { toast.error(isSo ? 'Version geli' : 'Enter a version'); return; }
    if (file.size > 200 * 1024 * 1024) { toast.error(isSo ? 'Fayl aad u weyn' : 'File too large'); return; }

    setUploading(true);
    setProgress(0);
    const started = Date.now();
    try {
      const key = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${key}/${Date.now()}-${version.trim().replace(/[^\w.\-]/g, '')}.apk`;

      const { data: signed, error: signErr } = await supabase.storage
        .from('app-releases')
        .createSignedUploadUrl(path);
      if (signErr || !signed) throw signErr || new Error('Sign failed');

      await uploadWithProgress(signed.signedUrl, file);

      const { error: insErr } = await supabase.from('app_releases').insert({
        app_key: key,
        app_name: appName.trim(),
        version: version.trim(),
        release_notes: notes.trim() || null,
        file_path: path,
        file_size: file.size,
        is_current: true,
      });
      if (insErr) throw insErr;

      const secs = Math.round((Date.now() - started) / 1000);
      toast.success((isSo ? 'APK waa la geliyay' : 'APK uploaded') + ` (${secs}s)`);
      setVersion(''); setNotes('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e: any) {
      toast.error(e?.message || (isSo ? 'Khalad ayaa dhacay' : 'Upload failed'));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };


  const handleDelete = async (r: Release) => {
    if (!confirm(isSo ? 'Ma hubtaa tirtiridda?' : 'Delete this release?')) return;
    await supabase.storage.from('app-releases').remove([r.file_path]);
    const { error } = await supabase.from('app_releases').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
    load();
  };

  return (
    <div className="space-y-3">
      {/* Upload form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <Upload className="h-4 w-4 text-primary" />
          {isSo ? 'APK Cusub Geli' : 'Upload new APK'}
        </h3>
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={isSo ? 'Version (tusaale 1.4.0)' : 'Version (e.g. 1.4.0)'}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={isSo ? 'Waxa cusub (ikhtiyaari)' : 'Release notes (optional)'}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent px-3 py-2"
        />
        <input ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" className="w-full text-xs" />
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? `${progress}%` : 'Upload'}
        </button>
        {uploading && (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>


      {/* Uploaded releases */}
      {loading && <p className="text-xs text-gray-400 px-1">{isSo ? 'Waa la soo rarayaa…' : 'Loading…'}</p>}
      {releases.map((r) => (
        <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {r.app_name} · v{r.version}
              </h3>
              {r.release_notes && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-line">{r.release_notes}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                APK · {(r.file_size / (1024 * 1024)).toFixed(1)} MB · {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => handleDownload(r)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              <Download className="h-4 w-4" />
              {isSo ? 'Soo dejiso' : 'Download'}
            </button>
            <button
              onClick={() => handleDelete(r)}
              className="flex items-center justify-center px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 text-xs font-medium"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      {!loading && releases.length === 0 && (
        <p className="text-xs text-gray-400 px-1">
          {isSo ? 'Wali APK lama gelin.' : 'No APK uploaded yet.'}
        </p>
      )}

      <p className="text-[11px] text-gray-400 px-1">
        {isSo
          ? 'Fiiro: Android waxaa laga yaabaa inuu weydiiyo "Install unknown apps" markaad APK-ga rakibayso.'
          : 'Note: Android may ask to allow "Install unknown apps" when installing the APK.'}
      </p>
    </div>
  );
}
