import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Share2, Gift, Users, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const Referral = () => {
  const navigate = useNavigate();
  const phone = localStorage.getItem('verifiedPhone') || '';
  const [code, setCode] = useState('');
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inputCode, setInputCode] = useState('');
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!phone) {
      navigate('/');
      return;
    }
    (async () => {
      const { data, error } = await (supabase as any).rpc('get_my_referral_code', { p_phone: phone });
      if (!error && data && data[0]) {
        setCode(data[0].code || '');
        setTotalReferrals(data[0].total_referrals ?? 0);
        setAlreadyRedeemed(!!data[0].already_redeemed);
      } else {
        const { data: summary } = await (supabase as any).rpc('get_referral_summary', { p_phone: phone });
        setAlreadyRedeemed(!!(summary && summary.already_redeemed));
      }
      setLoading(false);
    })();
  }, [phone, navigate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code waa la copy-gareeye!');
    } catch {
      toast.error('Copy ma suurtogal ah');
    }
  };

  const handleShare = async () => {
    const text = `Isticmaal code-kayga referral-ka Riyokaab Data: ${code}\nSoo degso app-ka: https://riyokaabdata.com`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Riyokaab Data Referral', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Farriinta waa la copy-gareeye!');
      }
    } catch {}
  };

  const handleApply = async () => {
    if (!inputCode.trim()) return;
    setApplying(true);
    const { data, error } = await (supabase as any).rpc('apply_referral_code', {
      p_code: inputCode.trim().toUpperCase(),
      p_new_phone: phone,
    });
    setApplying(false);
    if (error) {
      toast.error('Khalad ayaa dhacay');
      return;
    }
    if (data?.success) {
      toast.success(data.message || 'Waa la dhameystiray');
      setAlreadyRedeemed(true);
      setInputCode('');
    } else {
      toast.error(data?.message || 'Ma shaqeyn');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div
        style={{
          backgroundColor: '#006f00',
          paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))',
        }}
        className="text-white py-4 px-4"
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-white text-lg font-bold">Referral Program</h1>
            <p className="text-white/70 text-xs">Casuun asxaabtaada</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {!loading && !code ? (
          <div className="bg-card border rounded-2xl p-5 text-center space-y-2">
            <Gift className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="font-semibold text-foreground">Weli code referral ah ma haysatid</div>
            <p className="text-sm text-muted-foreground">
              Code-ka referral-ka waxaa bixiya maamulka. La xiriir taageerada si laguu siiyo code.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card border rounded-2xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Users className="w-4 h-4" /> Dadka aad keentay
              </div>
              <div className="text-3xl font-bold text-foreground">{loading ? '…' : totalReferrals}</div>
            </div>

            <div className="bg-gradient-to-br from-green-600 to-green-500 text-white rounded-2xl p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-2 text-sm opacity-90">
                <Gift className="w-4 h-4" /> Code-kaaga referral-ka
              </div>
              <div className="text-4xl font-bold tracking-widest text-center py-3 bg-white/15 rounded-xl mb-3">
                {loading ? '……' : code}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleCopy} variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0">
                  <Copy className="w-4 h-4 mr-1" /> Copy
                </Button>
                <Button onClick={handleShare} variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0">
                  <Share2 className="w-4 h-4 mr-1" /> Wadaag
                </Button>
              </div>
            </div>

            <div className="bg-card border rounded-2xl p-4 space-y-2 text-sm">
              <div className="font-semibold text-foreground mb-1">Sida uu u shaqeeyo:</div>
              <div className="text-muted-foreground">• La wadaag code-kaaga saaxiib cusub.</div>
              <div className="text-muted-foreground">• Qof kasta oo code-kaaga isticmaala waa lagu diiwaangelinayaa, maamulkuna wuu kuu xisaabinayaa.</div>
            </div>
          </>
        )}

        {alreadyRedeemed && !loading && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-emerald-800 dark:text-emerald-200 text-sm">
            ✓ Hore ayaad u isticmaashay code referral ah.
          </div>
        )}
      </div>
    </div>
  );
};

export default Referral;