import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Loader2, Upload, DollarSign, Calendar, Phone, Hash, FileText, Clock,
  CheckCircle, XCircle, Package, Users, UserPlus, Smartphone, Ban, Globe, Pencil, Power, Trash2, Eye, RotateCcw,
  Plus, Image, Star, CreditCard, Settings, Code, ChevronDown, User, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useProviderResponseMessages, matchProviderMessage } from '@/lib/providerMessages';

// Re-export icons for child views
export {
  Search, Loader2, Upload, DollarSign, Calendar, Phone, Hash, FileText, Clock,
  CheckCircle, XCircle, Package, Users, UserPlus, Smartphone, Ban, Globe, Pencil, Power, Trash2, Eye, RotateCcw,
  Plus, Image, Star, CreditCard, Settings, Code, ChevronDown, User, Send,
};

// ========== HELPERS ==========
export const formatPhone = (phone: string) => {
  if (!phone) return '';
  // Display phone numbers as plain digits (no dashes)
  return phone.replace(/\D/g, '');
};
export const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
export const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
export const formatTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Hadda';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};
export const normalizePhone = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('252') && clean.length >= 12) return clean.slice(3);
  if (clean.length === 10 && clean.startsWith('0')) return clean.slice(1);
  return clean;
};

// ========== LAZY FALLBACK ==========
export const LazyFallback = () => (
  <div className="flex justify-center items-center py-16">
    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
  </div>
);

// ========== STAT CARDS ROW ==========
export const StatCardsRow = ({ cards }: { cards: { label: string; value: string | number; icon: any; color: string }[] }) => (
  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
    {cards.map((s, i) => (
      <div key={i} className="min-w-[90px] bg-white dark:bg-gray-800 rounded-xl border p-2.5 text-center flex-shrink-0 shadow-sm">
        <div className={`w-7 h-7 ${s.color} rounded-full mx-auto flex items-center justify-center mb-1`}>
          <s.icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-base font-bold text-gray-900 dark:text-white">{s.value}</div>
        <div className="text-[9px] text-gray-500 leading-tight">{s.label}</div>
      </div>
    ))}
  </div>
);

// ========== FILTER ROW ==========
export const FilterRow = ({ filters, activeKey, onSelect, activeColor = 'bg-purple-600' }: {
  filters: { key: string; label: string; count: number }[];
  activeKey: string;
  onSelect: (key: string) => void;
  activeColor?: string;
}) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
    {filters.map(f => (
      <button key={f.key} onClick={() => onSelect(f.key)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeKey === f.key ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
        {f.label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeKey === f.key ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{f.count}</span>
      </button>
    ))}
  </div>
);

// ========== SEARCH INPUT ==========
export const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-gray-800 border text-sm outline-none" />
  </div>
);

// ========== INVOICE ROW ==========
export const InvoiceRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="flex items-center gap-2 py-1.5 border-b border-dashed border-purple-100 dark:border-purple-900/30 last:border-0">
    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
    <span className="text-[10px] text-gray-400 w-20 shrink-0">{label}</span>
    <span className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1 text-right">{value || '—'}</span>
  </div>
);

// ========== INVOICE ACCORDION CONTENT ==========
export const InvoiceAccordionContent = ({ rows, notes, id, actions, isSo }: {
  rows: { icon: any; label: string; value: string; color: string }[];
  notes?: string | null;
  id: string;
  actions?: React.ReactNode;
  isSo: boolean;
}) => {
  const providerMessages = useProviderResponseMessages();
  const matched = matchProviderMessage(notes, providerMessages, isSo);
  return (
  <div className="border-t border-purple-200/50 dark:border-purple-900/30 bg-gradient-to-b from-purple-50/80 to-white dark:from-purple-950/20 dark:to-gray-800 animate-in slide-in-from-top-1 duration-150">
    <div className="px-3 py-3">
      <div className="text-center mb-2.5">
        <div className="text-[10px] text-purple-500 uppercase tracking-wider font-semibold">{isSo ? 'Faahfaahin' : 'Details'}</div>
        <div className="w-12 h-0.5 bg-purple-300/50 mx-auto mt-1 rounded-full" />
      </div>
      <div className="space-y-1">
        {rows.filter(Boolean).map((row, ri) => (
          <InvoiceRow key={ri} {...row} />
        ))}
      </div>
      {matched && (
        <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
          <div className="text-[10px] text-rose-600 font-medium mb-0.5">
            📡 {isSo ? 'Jawaabta Shirkadda' : 'Provider Response'} · {matched.providerName}
          </div>
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{matched.text}</p>
        </div>
      )}
      {notes && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="text-[10px] text-yellow-600 font-medium mb-0.5">📝 {isSo ? 'Qoraalka' : 'Notes'}</div>
          <p className="text-xs text-yellow-700 dark:text-yellow-300 italic">{notes}</p>
        </div>
      )}
      {actions && <div className="flex items-center gap-2 mt-3 pt-2 border-t border-purple-100 dark:border-purple-900/30">{actions}</div>}
      <div className="text-[8px] text-gray-300 dark:text-gray-600 font-mono mt-2 text-center">ID: {id}</div>
    </div>
  </div>
  );
};

// ========== ACTION BUTTON ==========
export const ActionBtn = ({ onClick, icon: Icon, label, variant = 'default' }: {
  onClick: () => void; icon: any; label: string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
}) => {
  const colors = {
    default: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${colors[variant]}`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
};

// ========== EMPTY STATE ==========
export const EmptyState = ({ message }: { message: string }) => (
  <div className="text-center py-12"><span className="text-4xl">📭</span><p className="text-gray-400 text-sm mt-2">{message}</p></div>
);

// ========== IMAGE UPLOADER ==========
export const ImageUploader = ({ value, onChange, bucket, label }: { value: string; onChange: (url: string) => void; bucket: string; label: string }) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (error) throw error;
      // Try signed URL (works for private buckets); fallback to public URL
      const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(fileName, TEN_YEARS);
      let finalUrl = signed?.signedUrl;
      if (!finalUrl) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        finalUrl = urlData.publicUrl;
      }
      onChange(finalUrl);
      toast.success('Image uploaded!');
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-gray-500 font-medium">{label}</div>
      <div className="flex items-center gap-2">
        {value && <img src={value} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border" />}
        <label className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-all ${uploading ? 'border-gray-300 bg-gray-50' : 'border-purple-300 bg-purple-50/50 hover:bg-purple-100/50 dark:border-purple-700 dark:bg-purple-950/20'}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Upload className="w-4 h-4 text-purple-500" />}
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{uploading ? 'Uploading...' : (value ? 'Change' : 'Upload from Gallery')}</span>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Or paste URL..." className="w-full px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 border text-[11px] outline-none text-gray-500" />
    </div>
  );
};

// ========== ORDER ACTIONS HOOK ==========
export const useOrderActions = (setOrders: React.Dispatch<React.SetStateAction<any[]>>, isSo: boolean) => {
  const [pending, setPending] = useState<{ id: string; type: 'cancelled' | 'approved' } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryTarget, setRetryTarget] = useState<{ id: string; phone: string } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const cancelOrder = (id: string) => { setReason(''); setPending({ id, type: 'cancelled' }); };
  const markDelivered = (id: string) => { setReason(''); setPending({ id, type: 'approved' }); };

  const submitAction = async () => {
    if (!pending) return;
    if (!reason.trim()) { toast.error(isSo ? 'Fadlan sababta qor' : 'Please write a reason'); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const audit = {
      manual_action_note: reason.trim(),
      manual_action_at: now,
      manual_action_by: userData?.user?.id ?? null,
      manual_action_email: userData?.user?.email ?? null,
      manual_action_type: pending.type,
    };
    const changes = pending.type === 'cancelled'
      ? { status: 'cancelled', delivery_status: 'cancelled', ...audit }
      : { delivery_status: 'delivered', delivered_at: now, ...audit };
    const { error } = await supabase.from('orders').update(changes).eq('id', pending.id);
    setSaving(false);
    if (error) { toast.error('Error'); return; }
    setOrders(prev => prev.map(o => o.id === pending.id ? { ...o, ...changes } : o));
    toast.success(pending.type === 'cancelled'
      ? (isSo ? 'Dalabka waa la kanselay' : 'Order cancelled')
      : (isSo ? 'Waa la ansixiyay' : 'Order approved'));
    setPending(null);
  };

  const retryDelivery = (id: string, phone?: string) => {
    setRetryTarget({ id, phone: phone || '' });
  };

  const confirmRetry = async () => {
    if (!retryTarget) return;
    setRetrying(true);
    const { id } = retryTarget;
    const { error } = await supabase.from('orders').update({ delivery_status: 'pending', status: 'paid' }).eq('id', id);
    setRetrying(false);
    if (error) { toast.error('Error'); return; }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, delivery_status: 'pending', status: 'paid' } : o));
    setRetryTarget(null);
    toast.success(isSo ? 'Dib loo diray' : 'Resending delivery');
  };

  const dialog = pending ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => !saving && setPending(null)}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="font-bold text-sm text-gray-800 dark:text-white">
          {pending.type === 'cancelled'
            ? (isSo ? 'Sababta kansalka' : 'Cancellation reason')
            : (isSo ? 'Sababta ansixinta' : 'Approval reason')}
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder={isSo ? 'Sababta halkan ku qor...' : 'Write the reason here...'}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 outline-none focus:border-purple-400"
        />
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => setPending(null)}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {isSo ? 'Jooji' : 'Cancel'}
          </button>
          <button disabled={saving} onClick={submitAction}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${pending.type === 'cancelled' ? 'bg-red-600' : 'bg-green-600'}`}>
            {saving ? '...' : (isSo ? 'Xaqiiji' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const retryDialog = retryTarget ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={() => !retrying && setRetryTarget(null)}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="font-bold text-sm text-gray-800 dark:text-white">
          {isSo ? 'Dib u dir dalabka' : 'Resend order'}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {isSo ? 'Ma hubtaa inaad dalabkan u dirayso' : 'Are you sure you want to resend this order to'}{' '}
          <span className="font-bold">{retryTarget.phone ? `+252${retryTarget.phone}` : ''}</span>?
        </p>
        <div className="flex gap-2">
          <button disabled={retrying} onClick={() => setRetryTarget(null)}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {isSo ? 'Maya' : 'No'}
          </button>
          <button disabled={retrying} onClick={confirmRetry}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 disabled:opacity-60">
            {retrying ? '...' : (isSo ? 'Haa, dir' : 'Yes, send')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    cancelOrder,
    retryDelivery,
    markDelivered,
    dialog: (<>{dialog}{retryDialog}</>),
  };
};

// ========== PROVIDER FILTER ROW ==========
export const ProviderFilterRow = ({ providers, activeId, onSelect, activeColor = 'bg-purple-600', totalCount, allLabel = 'All', countFn }: {
  providers: any[];
  activeId: string;
  onSelect: (id: string) => void;
  activeColor?: string;
  totalCount: number;
  allLabel?: string;
  countFn: (provId: string) => number;
}) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
    <button onClick={() => onSelect('all')}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeId === 'all' ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
      {allLabel} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeId === 'all' ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{totalCount}</span>
    </button>
    {providers.map(prov => {
      const count = countFn(prov.id);
      if (count === 0) return null;
      return (
        <button key={prov.id} onClick={() => onSelect(prov.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeId === prov.id ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
          {prov.provider_logo && <img src={prov.provider_logo} alt="" className="w-5 h-5 rounded-full object-cover" />}
          {prov.provider_name} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeId === prov.id ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{count}</span>
        </button>
      );
    })}
  </div>
);
