import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import somaliaFlag from '@/assets/somalia-flag-hq.png';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldCheck, Gift } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const ACQUISITION_SOURCES: { key: string; label: string; emoji: string; logo: string }[] = [
  { key: 'tiktok',    label: 'TikTok',         emoji: '🎵', logo: 'https://cdn.simpleicons.org/tiktok/000000' },
  { key: 'facebook',  label: 'Facebook',       emoji: '📘', logo: 'https://cdn.simpleicons.org/facebook/1877F2' },
  { key: 'instagram', label: 'Instagram',      emoji: '📸', logo: 'https://cdn.simpleicons.org/instagram/E4405F' },
  { key: 'whatsapp',  label: 'WhatsApp',       emoji: '💬', logo: 'https://cdn.simpleicons.org/whatsapp/25D366' },
  { key: 'youtube',   label: 'YouTube',        emoji: '▶️', logo: 'https://cdn.simpleicons.org/youtube/FF0000' },
  { key: 'friend',    label: 'Saaxiib / Qoys', emoji: '👥', logo: '' },
  { key: 'google',    label: 'Google',         emoji: '🔍', logo: 'https://cdn.simpleicons.org/google/4285F4' },
  { key: 'other',     label: 'Sabab kale',     emoji: '✍️', logo: '' },
];

const PhoneInput = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPrefixError, setShowPrefixError] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [sourceOther, setSourceOther] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [verifiedNewPhone, setVerifiedNewPhone] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const generateVerificationCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 9) {
      setPhoneNumber(value);
      setShowPrefixError(false);
    }
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli lambarka telefoonkaaga",
        variant: "destructive",
      });
      return;
    }

    const allowedPrefixes = ['61', '77', '62', '68'];
    const hasAllowedPrefix = allowedPrefixes.some(prefix => phoneNumber.startsWith(prefix));
    
    if (!hasAllowedPrefix || phoneNumber.length !== 9) {
      setShowPrefixError(true);
      toast({
        title: "Error",
        description: "Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    // Validate referral code BEFORE sending OTP (if user entered one)
    const pendingRef = referralCode.trim().toUpperCase();
    if (pendingRef.length > 0) {
      if (pendingRef.length < 4) {
        toast({
          title: '❌ Referral code khaldan',
          description: 'Fadlan geli code sax ah ama ka saar goobta referral-ka',
          variant: 'destructive',
        });
        setShowReferralInput(true);
        setIsSending(false);
        return;
      }
      try {
        const { data: exists, error: refLookupErr } = await (supabase as any).rpc(
          'check_referral_code_exists',
          { p_code: pendingRef },
        );
        if (refLookupErr) throw refLookupErr;
        if (!exists) {
          toast({
            title: '❌ Referral code khaldan',
            description: 'Code-kani ma jiro. Fadlan hubi oo mar kale isku day.',
            variant: 'destructive',
          });
          setShowReferralInput(true);
          setReferralCode('');
          setIsSending(false);
          return;
        }
      } catch (e) {
        console.error('[Referral] validation failed', e);
        toast({
          title: '❌ Referral code khaldan',
          description: 'Code-ka lama xaqiijin karin. Fadlan isku day mar kale.',
          variant: 'destructive',
        });
        setShowReferralInput(true);
        setIsSending(false);
        return;
      }
    }

    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;
    
    try {
      // Check if phone is already verified
      // NOTE: existence check happens server-side via upsert_verified_phone_login
      // during handleVerifyCode; here we skip anon SELECT (blocked by RLS).

      // Show code on screen directly - no SMS needed
      setGeneratedCode(code);
      setIsCodeSent(true);
      localStorage.setItem('verificationCode', code);
      localStorage.setItem('codeTimestamp', Date.now().toString());
      localStorage.setItem('pendingPhone', phoneNumber);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Wax khalad ah ayaa dhacay',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendCode = () => {
    const code = generateVerificationCode();
    setGeneratedCode(code);
    localStorage.setItem('verificationCode', code);
    localStorage.setItem('codeTimestamp', Date.now().toString());
    setVerificationCode('');
    toast({
      title: "Code cusub!",
      description: "Koodka cusub ayaa shaashada kugu soo muuqday",
    });
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli koodka xaqiijinta",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    
    const storedCode = localStorage.getItem('verificationCode');
    const codeTimestamp = localStorage.getItem('codeTimestamp');
    
    if (codeTimestamp) {
      const timeElapsed = (Date.now() - parseInt(codeTimestamp)) / 1000;
      if (timeElapsed > 120) {
        toast({
          title: "Koodka wuu dhacay",
          description: "Fadlan code cusub soo codso",
          variant: "destructive",
        });
        setIsVerifying(false);
        return;
      }
    }
    
    if (verificationCode === storedCode) {
      try {
        const fullPhoneNumber = `+252${phoneNumber}`;

        const { data: loginRes } = await (supabase as any).rpc(
          'upsert_verified_phone_login',
          { p_phone: fullPhoneNumber },
        );
        const isNew = !!(loginRes && loginRes.is_new);
        (window as any).__isNewVerifiedUser = isNew;
        if (!isNew) setIsReturningUser(true);
      } catch (error) {
        console.error('Error saving verified phone:', error);
      }
      
      // Apply referral code FIRST (if entered) so we can block on invalid code
      const pendingRef = referralCode.trim().toUpperCase();
      if (pendingRef.length > 0) {
        if (pendingRef.length < 4) {
          toast({
            title: 'Referral code khaldan',
            description: 'Fadlan geli code sax ah ama ka saar goobta referral-ka',
            variant: 'destructive',
          });
          setIsVerifying(false);
          setShowReferralInput(true);
          return;
        }
        try {
          const { data: refDataRaw, error: refErr } = await (supabase as any).rpc('apply_referral_code', {
            p_code: pendingRef,
            p_new_phone: phoneNumber,
          });
          if (refErr) throw refErr;
          const refData = typeof refDataRaw === 'string' ? JSON.parse(refDataRaw) : refDataRaw;
          console.log('[Referral] response:', refData);
          if (!refData || refData.success !== true) {
            toast({
              title: '❌ Referral code khaldan',
              description: (refData && refData.message) || 'Code-kani ma jiro. Fadlan mar kale isku day.',
              variant: 'destructive',
            });
            setIsVerifying(false);
            setShowReferralInput(true);
            setReferralCode('');
            return;
          }
          toast({ title: '🎁 Referral', description: refData.message || 'Code waa la qaatay' });
        } catch (e: any) {
          console.error('Referral apply failed', e);
          toast({
            title: '❌ Referral code khaldan',
            description: 'Code-ka lama xaqiijin karin. Fadlan isku day mar kale.',
            variant: 'destructive',
          });
          setIsVerifying(false);
          setShowReferralInput(true);
          return;
        }
      }

      localStorage.setItem('verifiedPhone', phoneNumber);
      localStorage.setItem('userPhone', phoneNumber);
      localStorage.removeItem('verificationCode');
      localStorage.removeItem('codeTimestamp');
      localStorage.removeItem('pendingPhone');
      localStorage.setItem('referralPromptSeen', '1');

      toast({
        title: "Guul!",
        description: "Lambarka telefoonka waa la xaqiijiyay",
      });
      
      setIsVerifying(false);
      const fullPhone = `+252${phoneNumber}`;
      const askedKey = `acqSrcAsked:${fullPhone}`;
      const alreadyAnswered = localStorage.getItem(askedKey) === '1';
      if (!alreadyAnswered) {
        setVerifiedNewPhone(fullPhone);
        setShowSourceDialog(true);
      } else {
        navigate('/offline-mode');
      }
    } else {
      toast({
        title: "Kood khaldan",
        description: "Koodka aad gelisay waa khalad",
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  const submitAcquisitionSource = async (sourceKey: string) => {
    if (savingSource) return;
    if (sourceKey === 'other' && !sourceOther.trim()) {
      toast({ title: 'Fadlan qor sababta', variant: 'destructive' });
      return;
    }
    setSavingSource(true);
    try {
      await (supabase as any)
        .from('user_acquisition_sources')
        .upsert(
          {
            phone_number: verifiedNewPhone || `+252${phoneNumber}`,
            source: sourceKey,
            other_text: sourceKey === 'other' ? sourceOther.trim() : null,
          },
          { onConflict: 'phone_number', ignoreDuplicates: true },
        );
    } catch (e) {
      console.error('Failed to save acquisition source', e);
    }
    const phoneUsed = verifiedNewPhone || `+252${phoneNumber}`;
    localStorage.setItem(`acqSrcAsked:${phoneUsed}`, '1');
    setSavingSource(false);
    setShowSourceDialog(false);
    navigate('/offline-mode');
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {!isCodeSent ? (
        <>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-base font-medium text-muted-foreground">
              Geli lambarka telefoonkaaga
            </label>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 bg-card border border-input rounded-xl px-3 py-2.5 text-base font-medium">
                <img src={somaliaFlag} alt="Calanka Somalia" className="w-7 h-5 object-cover rounded" />
                <span>+252</span>
              </div>
              <Input
                id="phone"
                type="tel"
                placeholder="61 xxx xxxx"
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
                maxLength={9}
                className="flex-1 h-12 text-base rounded-xl focus:border-primary focus:ring-primary/30 focus:outline-none focus:ring-2"
              />
            </div>
            {showPrefixError && (
              <p className="text-xs text-destructive">
                Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay
              </p>
            )}
          </div>

          {/* Referral code (optional, before verification) */}
          <div className="w-full">
            {!showReferralInput ? (
              <button
                type="button"
                onClick={() => setShowReferralInput(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/30 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                <Gift className="w-3.5 h-3.5" />
                Ma haysaa referral code? (ikhtiyaari)
              </button>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Referral code (ikhtiyaari)</span>
                </div>
                <Input
                  type="text"
                  placeholder="RY7K2Q"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="w-full h-10 text-center text-base font-bold tracking-widest uppercase rounded-lg"
                />
                <p className="text-[10px] text-muted-foreground text-center">
                  Saaxiibkaa waa loo diiwaangelinayaa marka aad xaqiijiso
                </p>
              </div>
            )}
          </div>

          <Button 
            onClick={handleSendCode}
            disabled={isSending}
            className="w-full gradient-button text-primary-foreground font-semibold h-12 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Login'
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="text-center space-y-1">
            {isReturningUser && (
              <p className="text-sm font-semibold text-primary">
                🎉 Soo dhawaaw mar kale!
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Xaqiijinta lambarka +252 {phoneNumber}
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-primary">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-semibold">Koodkaagu waa</span>
            </div>
            <div className="flex justify-center gap-2">
              {generatedCode.split('').map((digit, i) => (
                <span key={i} className="text-3xl font-bold text-primary bg-primary/10 rounded-lg w-12 h-12 flex items-center justify-center">
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Geli koodkan hoosta</p>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="code" className="text-sm font-medium text-muted-foreground">
              Koodka Xaqiijinta
            </label>
            <div className="flex gap-2 justify-center">
              {[0, 1, 2, 3].map((index) => (
                <Input
                  key={index}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  value={verificationCode[index] || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length > 1) {
                      const digits = value.slice(0, 4).split('');
                      setVerificationCode(digits.join('').padEnd(4, ''));
                      const lastIndex = Math.min(digits.length - 1, 3);
                      setTimeout(() => {
                        const lastInput = document.querySelectorAll('input[type="text"]')[lastIndex] as HTMLInputElement;
                        lastInput?.focus();
                      }, 0);
                    } else if (value) {
                      const newCode = verificationCode.split('');
                      newCode[index] = value;
                      setVerificationCode(newCode.join(''));
                      if (index < 3) {
                        const nextInput = document.querySelectorAll('input[type="text"]')[index + 1] as HTMLInputElement;
                        nextInput?.focus();
                      }
                    } else {
                      const newCode = verificationCode.split('');
                      newCode[index] = '';
                      setVerificationCode(newCode.join(''));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      if (verificationCode[index]) {
                        const newCode = verificationCode.split('');
                        newCode[index] = '';
                        setVerificationCode(newCode.join(''));
                        e.preventDefault();
                      } else if (index > 0) {
                        const prevInput = document.querySelectorAll('input[type="text"]')[index - 1] as HTMLInputElement;
                        const newCode = verificationCode.split('');
                        newCode[index - 1] = '';
                        setVerificationCode(newCode.join(''));
                        prevInput?.focus();
                        e.preventDefault();
                      }
                    } else if (e.key === 'Delete') {
                      const newCode = verificationCode.split('');
                      newCode[index] = '';
                      setVerificationCode(newCode.join(''));
                      e.preventDefault();
                    }
                  }}
                  className="w-12 h-12 text-center text-xl font-semibold rounded-xl focus:border-primary focus:ring-primary/30 focus:outline-none focus:ring-2"
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              className="text-primary hover:underline text-sm"
              onClick={handleResendCode}
            >
              Code cusub
            </button>
          </div>
          
          <Button 
            onClick={handleVerifyCode}
            disabled={isVerifying}
            className="w-full gradient-button text-primary-foreground font-semibold h-11 rounded-xl text-base hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isVerifying ? 'Waa la xaqiijinayaa...' : 'Verify'}
          </Button>
          
          <button 
            onClick={() => setIsCodeSent(false)}
            className="w-full text-sm font-medium text-foreground/90 hover:text-primary transition-colors pt-0.5"
          >
            Bedel Lambarka Telefoonka
          </button>
        </>
      )}

      <Dialog open={showSourceDialog} onOpenChange={(open) => {
        // Prevent closing without a choice
        if (!open && !savingSource) return;
      }}>
        <DialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Halkee naga soo raacday? 🎉</DialogTitle>
            <DialogDescription>
              Ku caawi in aan ogaano meesha aad app-ka ka ogaatay.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {ACQUISITION_SOURCES.map((s) => (
              <button
                key={s.key}
                disabled={savingSource}
                onClick={() => {
                  if (s.key === 'other') {
                    // Show input, don't submit yet
                    setSourceOther('');
                    // toggle inline: replace choice by focusing input below
                    const el = document.getElementById('acq-other-input') as HTMLInputElement | null;
                    if (el) el.focus();
                  } else {
                    submitAcquisitionSource(s.key);
                  }
                }}
                className="flex items-center gap-2 border rounded-xl px-3 py-3 hover:bg-muted/60 text-left text-sm font-medium disabled:opacity-50"
              >
                {s.logo ? (
                  <img src={s.logo} alt="" className="w-6 h-6 object-contain" />
                ) : (
                  <span className="text-xl w-6 h-6 flex items-center justify-center">{s.emoji}</span>
                )}
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            <label className="text-xs text-muted-foreground">Haddii "Sabab kale" aad dooratay, halkan ku qor:</label>
            <div className="flex gap-2">
              <Input
                id="acq-other-input"
                placeholder="Tusaale: xayeysiis, radio…"
                value={sourceOther}
                onChange={(e) => setSourceOther(e.target.value)}
                maxLength={80}
              />
              <Button
                type="button"
                disabled={savingSource || !sourceOther.trim()}
                onClick={() => submitAcquisitionSource('other')}
              >
                {savingSource ? '...' : 'Kaydi'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhoneInput;