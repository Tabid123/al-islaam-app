import { useState, useEffect } from 'react';
import riyokaabLogo from '@/assets/riyokaab-logo.jpeg';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import somaliaFlag from '@/assets/somalia-flag-hq.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';

// Full provider map for receiver phone (all providers supported)
const allProviderMap: {
  [key: string]: { id: string; name: string; logo: string };
} = {
  '61': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '77': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '68': { id: 'somnet', name: 'Somnet', logo: somnetLogo },
  '62': { id: 'somtel', name: 'Somtel', logo: somtelLogo },
  '71': { id: 'amtel', name: 'Amtel', logo: amtelLogo },
  '64': { id: 'somlink', name: 'Somlink', logo: somlinkLogo }
};

// Sender phone only supports Hormuud (61, 77) and Somnet (68)
const senderProviderMap: {
  [key: string]: { id: string; name: string; logo: string };
} = {
  '61': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '77': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '68': { id: 'somnet', name: 'Somnet', logo: somnetLogo }
};
const supportedSenderPrefixes = ['61', '77', '68'];

const detectReceiverProvider = (phone: string) => {
  if (phone.length < 2) return null;
  return allProviderMap[phone.substring(0, 2)] || null;
};
const detectSenderProvider = (phone: string) => {
  if (phone.length < 2) return null;
  return senderProviderMap[phone.substring(0, 2)] || null;
};
const isUnsupportedSenderPrefix = (phone: string): boolean => {
  if (phone.length < 2) return false;
  return !supportedSenderPrefixes.includes(phone.substring(0, 2));
};

const OfflineMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isReallyOnline } = useConnectivity();
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderError, setSenderError] = useState(false);
  const [receiverError, setReceiverError] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState<{ id: string; name: string; logo: string } | null>(null);
  const [detectedSenderProvider, setDetectedSenderProvider] = useState<{ id: string; name: string; logo: string } | null>(null);
  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';

  useEffect(() => {
    const currentSender = localStorage.getItem('offlineSenderPhone') || '';
    const currentReceiver = localStorage.getItem('offlineReceiverPhone') || '';
    if (currentSender && !senderPhone) setSenderPhone(currentSender);
    if (currentReceiver && !receiverPhone) setReceiverPhone(currentReceiver);
  }, []);

  useEffect(() => {
    setDetectedProvider(detectReceiverProvider(receiverPhone));
    if (receiverPhone.length > 0) setReceiverError(false);
  }, [receiverPhone]);

  useEffect(() => {
    setDetectedSenderProvider(detectSenderProvider(senderPhone));
    if (senderPhone.length > 0) setSenderError(false);
  }, [senderPhone]);

  const handleRegister = async () => {
    const isValidSender = senderPhone.length === 9 && /^\d+$/.test(senderPhone);
    const isValidReceiver = receiverPhone.length === 9 && /^\d+$/.test(receiverPhone);
    if (!isValidSender) setSenderError(true);
    if (!isValidReceiver) setReceiverError(true);
    if (!isValidSender || !isValidReceiver) return;
    if (!detectedProvider) {
      setReceiverError(true);
      return;
    }
    setIsRegistering(true);
    
    if (!navigator.onLine) {
      toast({
        title: "Internet ma jiro",
        description: "Waxaad u baahan tahay internet si aad u diiwaan geliso lambarada",
        variant: "destructive",
        duration: 3000
      });
      setIsRegistering(false);
      return;
    }
    
    try {
      localStorage.setItem('offlineSenderPhone', senderPhone);
      localStorage.setItem('offlineReceiverPhone', receiverPhone);
      if (navigator.onLine) {
        // Try to find provider by name first, fallback to saving without provider_id
        let providerDbId: string | null = null;
        const { data: providerData } = await supabase
          .from('providers_config')
          .select('id')
          .ilike('provider_name', detectedProvider.name)
          .maybeSingle();
        
        if (providerData) {
          providerDbId = providerData.id;
        }

        const { data: regRes, error: upsertError } = await (supabase as any).rpc(
          'save_offline_registration',
          {
            p_sender: senderPhone,
            p_receiver: receiverPhone,
            p_provider_id: providerDbId,
            p_provider_name: detectedProvider.name,
          },
        );
        if (upsertError || !regRes?.success) {
          console.error('Registration error:', upsertError || regRes);
        } else {
          toast({
            title: "Lagu guuleystay",
            description: "Lambarada ayaa database-ka lagu kaydiyey",
            duration: 2000
          });
        }
      }
      navigate('/providers');
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Digniinta",
        description: "Registration ma keydsamo lakin wuu socon doonaa",
        variant: "default"
      });
      navigate('/providers');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-6">
      {/* Step Progress */}
      <div className="w-full max-w-sm mb-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-primary">Login</span>
          </div>
          <div className="w-12 h-0.5 bg-primary" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              2
            </div>
            <span className="text-sm font-medium text-primary">Lambarada</span>
          </div>
          <div className="w-12 h-0.5 bg-muted" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
              3
            </div>
            <span className="text-sm font-medium text-muted-foreground">Iibso</span>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="mb-6 mt-2">
        <img alt="Riyokaab Data" className="w-28 h-28 object-contain rounded-2xl shadow-2xl shadow-primary/30 ring-1 ring-border/50 bg-card p-1" src={riyokaabLogo} />
      </div>

      {/* Tagline */}
      <div className="text-center mb-8 max-w-sm">
        <h1 className="font-bold mb-4 text-3xl text-center">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Iibso Internet adigoo Offline ah!
          </span>
        </h1>
        
        <div className="bg-primary/5 backdrop-blur-sm rounded-xl p-4 border border-primary/20">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Diiwaangeli lambarka aad <span className="text-primary font-semibold">lacagta ka direysid</span> iyo 
            lambarka aad <span className="text-primary font-semibold">internet-ka u rabtid</span>, si aad 
            ugu shubtid adigoo offline ah.
          </p>
          <p className="text-center mt-3 text-lg">🎉 Mahadsanid!</p>
        </div>
      </div>

      {/* Phone Inputs */}
      <div className="w-full max-w-sm space-y-4 mb-8">
        {/* Sender Phone Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">📤 Lambarka lacagta laga dirayo</label>
          <div className={`flex items-center border-2 rounded-xl overflow-hidden bg-background transition-colors ${senderError ? 'border-destructive' : 'border-border focus-within:border-primary'}`}>
            <div className="flex items-center gap-2 py-3 bg-muted/30 border-r border-border px-[15px]">
              <img src={somaliaFlag} alt="Somalia" className="w-6 h-4 object-cover rounded-sm" />
              <span className="text-foreground font-medium">+252</span>
            </div>
            <div className="flex-1 px-[15px] flex items-center gap-[8px]">
              {detectedSenderProvider ? (
                <img src={detectedSenderProvider.logo} alt={detectedSenderProvider.name} className="w-6 h-6 rounded-full flex-shrink-0 object-contain" />
              ) : (
                <Phone className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              )}
              <input
                type="tel"
                placeholder={savedSenderPhone || "61 xxx xxxx"}
                value={senderPhone}
                onChange={e => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setSenderPhone(value);
                }}
                maxLength={9}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-lg py-[10px] px-0"
              />
            </div>
          </div>
          {senderError && <p className="text-sm text-destructive">Fadlan geli lambar saxan (9 tiro)</p>}
          {isUnsupportedSenderPrefix(senderPhone) && !senderError && (
            <p className="text-sm text-destructive">Hormuud (61, 77) iyo Somnet (68) kaliya ayaa la taageera</p>
          )}
        </div>

        {/* Receiver Phone Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">📥 Lambarka internet-ka loo rabo</label>
          <div className={`flex items-center border-2 rounded-xl overflow-hidden bg-background transition-colors ${receiverError ? 'border-destructive' : 'border-border focus-within:border-primary'}`}>
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-r border-border">
              <img src={somaliaFlag} alt="Somalia" className="w-6 h-4 object-cover rounded-sm" />
              <span className="text-foreground font-medium">+252</span>
            </div>
            <div className="flex items-center flex-1 px-3 gap-[8px]">
              {detectedProvider ? (
                <img src={detectedProvider.logo} alt={detectedProvider.name} className="w-6 h-6 rounded-full flex-shrink-0 object-scale-down" />
              ) : (
                <Phone className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              )}
              <input
                type="tel"
                placeholder={savedReceiverPhone || "61 xxx xxxx"}
                value={receiverPhone}
                onChange={e => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setReceiverPhone(value);
                }}
                maxLength={9}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-lg py-[10px] px-0"
              />
            </div>
          </div>
          {receiverError && <p className="text-sm text-destructive">Fadlan geli lambar saxan (9 tiro)</p>}
          {detectedProvider && !receiverError && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span>Provider: {detectedProvider.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleRegister}
          disabled={isRegistering || !senderPhone || !receiverPhone}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] py-3"
        >
          {isRegistering ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Sugayso...
            </span>
          ) : (
            'Sii wad →'
          )}
        </button>

        <button
          onClick={() => {
            localStorage.setItem('hasSkippedOfflineRegistration', 'true');
            navigate('/providers');
          }}
          className="w-full rounded-xl border border-border text-muted-foreground font-medium text-sm transition-all hover:bg-muted/50 active:scale-[0.98] py-2.5"
        >
          Skip →
        </button>
      </div>
    </div>
  );
};

export default OfflineMode;