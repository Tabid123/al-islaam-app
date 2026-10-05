import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Zap, Clock, Smartphone, Copy, AlertTriangle, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { format as formatDate } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PaymentErrorModal } from '@/components/PaymentErrorModal';
import { PaymentLoadingOverlay } from '@/components/PaymentLoadingOverlay';
import OfflinePhoneInputSheet from '@/components/OfflinePhoneInputSheet';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { Capacitor } from '@/shims/capacitor';
import { activePaymentProviders, fetchActivePaymentProviders, readCachedPaymentProviders, PAYMENT_QUERY_KEY } from '@/lib/paymentProviders';
import { isApiPayment, paymentRoute, purchaseWithWaafiPay } from '@/lib/waafiPay';
import { purchaseWithEdahab } from '@/lib/edahabPay';
import { normalizeSomaliPhone } from '@/lib/customerOrders';
const CONFIRMATION_VOICE_URL = '/confirmation-voice.mp3';
interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  payment_mode?: string;
  prefix_code: string | null;
  ussd_code_template: string | null;
  payment_number: string | null;
}
const PaymentProviders = () => {
  const navigate = useNavigate();
  const { isReallyOnline } = useConnectivity();
  const { queueOrder } = useOfflineSync();
  const queryClient = useQueryClient();
  const {
    provider
  } = useParams<{
    provider: string;
  }>();
  const location = useLocation();
  const packageData = location.state?.package;
  const providerName = location.state?.providerName;
  const categoryName = location.state?.categoryName || '';
  
  // Helper function to detect ADSL packages
  const isADSLPackage = (catName: string) => {
    return catName?.toUpperCase().includes('ADSL');
  };
  
  const isADSL = isADSLPackage(categoryName);
  const {
    data: paymentProviders = [],
    isLoading
  } = useQuery({
    queryKey: PAYMENT_QUERY_KEY,
    queryFn: () => isReallyOnline === true ? fetchActivePaymentProviders() : readCachedPaymentProviders(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: 1,
    initialData: readCachedPaymentProviders,
    initialDataUpdatedAt: 0,
  });

  useEffect(() => {
    if (isReallyOnline === true) queryClient.invalidateQueries({ queryKey: PAYMENT_QUERY_KEY });
  }, [isReallyOnline, queryClient]);

  useEffect(() => {
    const channel = supabase.channel('payment-providers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_providers_config' }, () => {
        queryClient.invalidateQueries({ queryKey: PAYMENT_QUERY_KEY });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Fetch delivery instructions for the package's category
  const {
    data: deliveryInstructions = []
  } = useQuery({
    queryKey: ['deliveryInstructions', packageData?.categoryId, packageData?.providerId],
    queryFn: async () => {
      if (!packageData?.categoryId && !packageData?.providerId) return [];
      
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
        return [];
      }
      
      const { data, error } = await supabase
        .from('delivery_instructions')
        .select('*')
        .eq('provider_id', packageData.providerId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!(packageData?.categoryId || packageData?.providerId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: () => {
      try {
        if (!packageData?.providerId) return [];
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
      } catch (e) {}
      return [];
    },
  });

  const [selectedProvider, setSelectedProvider] = useState(location.state?.paymentProviderId || '');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [receiverNumber, setReceiverNumber] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [showVoiceReplay, setShowVoiceReplay] = useState(false);

  // Schedule delivery for later — lacagta hadda, xirmada waqti kadib
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState<string>(''); // "HH:mm"

  const scheduledFor = React.useMemo<Date | null>(() => {
    if (!scheduleEnabled || !scheduleDate || !scheduleTime) return null;
    const [h, m] = scheduleTime.split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(scheduleDate);
    d.setHours(h, m, 0, 0);
    return d;
  }, [scheduleEnabled, scheduleDate, scheduleTime]);

  const scheduleIsValid = React.useMemo(() => {
    if (!scheduleEnabled) return true; // immediate delivery is always valid
    if (!scheduledFor) return false;
    return scheduledFor.getTime() > Date.now() + 60 * 1000;
  }, [scheduleEnabled, scheduledFor]);

  // Voice prompt played directly from the Pay Now tap so mobile browsers allow sound.
  const confirmationAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const activeConfirmationAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const decodedVoiceBufferRef = React.useRef<AudioBuffer | null>(null);
  const activeVoiceSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const lastVoicePlayRef = React.useRef(0);

  useEffect(() => {
    const audio = confirmationAudioRef.current;
    if (audio) {
      audio.volume = 1;
      audio.muted = false;
      audio.load();
    }

    let cancelled = false;
    const preloadVoice = async () => {
      try {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;
        const ctx = audioContextRef.current || new AudioContextCtor();
        audioContextRef.current = ctx;
        const response = await fetch(CONFIRMATION_VOICE_URL, { cache: 'reload' });
        const audioData = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(audioData.slice(0));
        if (!cancelled) decodedVoiceBufferRef.current = decoded;
      } catch {}
    };

    preloadVoice();

    return () => {
      cancelled = true;
      activeConfirmationAudioRef.current?.pause();
      try {
        activeVoiceSourceRef.current?.stop();
      } catch {}
    };
  }, []);

  const playConfirmationVoice = useCallback(() => {
    const now = Date.now();
    if (now - lastVoicePlayRef.current < 500) return;
    lastVoicePlayRef.current = now;
    setShowVoiceReplay(false);

    const playHtmlAudio = () => {
      try {
        activeConfirmationAudioRef.current?.pause();
        const a = confirmationAudioRef.current || new Audio(CONFIRMATION_VOICE_URL);
        activeConfirmationAudioRef.current = a;
        a.preload = 'auto';
        a.setAttribute('playsinline', 'true');
        a.pause();
        a.currentTime = 0;
        a.volume = 1;
        a.muted = false;
        const p = a.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            try {
              const freshAudio = new Audio(CONFIRMATION_VOICE_URL);
              activeConfirmationAudioRef.current = freshAudio;
              freshAudio.preload = 'auto';
              freshAudio.setAttribute('playsinline', 'true');
              freshAudio.volume = 1;
              freshAudio.muted = false;
              freshAudio.play().catch(() => setShowVoiceReplay(true));
            } catch {
              setShowVoiceReplay(true);
            }
          });
        }
      } catch {
        setShowVoiceReplay(true);
      }
    };

    try {
      const buffer = decodedVoiceBufferRef.current;
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (buffer && AudioContextCtor) {
        const ctx = audioContextRef.current || new AudioContextCtor();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => playHtmlAudio());
        try {
          activeVoiceSourceRef.current?.stop();
        } catch {}
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        activeVoiceSourceRef.current = source;
        source.start(0);
        return;
      }
      playHtmlAudio();
    } catch {
      playHtmlAudio();
    }
  }, []);
  const [paymentProviderPrefix, setPaymentProviderPrefix] = useState('');
  const [receiverProviderPrefix, setReceiverProviderPrefix] = useState('');
  const [allowedReceiverPrefixes, setAllowedReceiverPrefixes] = useState<string[]>([]);
  const [receiverNumberError, setReceiverNumberError] = useState('');
  const [paymentNumberError, setPaymentNumberError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorType, setErrorType] = useState<'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general'>('general');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTitle, setErrorTitle] = useState<string | undefined>();
  const [canRetryPayment, setCanRetryPayment] = useState(true);
  const [showOfflineSheet, setShowOfflineSheet] = useState(false);
  const isOfflineFromState = location.state?.isOffline;
  const [ussdCodeForDisplay, setUssdCodeForDisplay] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentInFlightRef = useRef(false);
  const selectedIsApi = isApiPayment(paymentProviders.find(p => p.id === selectedProvider));
  useEffect(() => {
    if (selectedProvider && !activePaymentProviders(paymentProviders).some(p => p.id === selectedProvider)) {
      setSelectedProvider('');
      setShowPaymentModal(false);
      setShowConfirmationScreen(false);
    }
  }, [paymentProviders, selectedProvider]);

  const getProviderFromPrefix = useCallback((phoneNumber: string) => {
    const prefix = phoneNumber.substring(0, 2);
    const firstChar = phoneNumber.substring(0, 1);
    
    // ADSL numbers start with '1' - they are Hormuud
    if (firstChar === '1' && phoneNumber.length === 7) {
      return {
        name: 'Hormuud',
        logo: hormuudLogo
      };
    }
    
    switch (prefix) {
      case '61':
      case '77':
        return {
          name: 'Hormuud',
          logo: hormuudLogo
        };
      case '62':
        return {
          name: 'Somtel',
          logo: somtelLogo
        };
      case '68':
        return {
          name: 'Somnet',
          logo: somnetLogo
        };
      case '63':
      case '65':
        return {
          name: 'Somlink',
          logo: somlinkLogo
        };
      case '71':
        return {
          name: 'Amtel',
          logo: amtelLogo
        };
      default:
        return {
          name: 'Provider',
          logo: ''
        };
    }
  }, []);
  const getProviderPrefix = useCallback((providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return '61';
      case 'somtel':
        return '62';
      case 'somnet':
        return '68';
      case 'somlink':
        return '63';
      case 'amtel':
        return '71';
      default:
        return '';
    }
  }, []);
  const getBrandBackgroundClass = useCallback((providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud';
      case 'somtel':
        return 'bg-somtel';
      case 'somlink':
        return 'bg-somlink';
      case 'somnet':
        return 'bg-somnet';
      case 'amtel':
        return 'bg-amtel';
      default:
        return 'bg-primary';
    }
  }, []);

  // Get offline registration phones (registered by user in offline mode)
  const offlineSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const offlineReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';
  // App-verified login phone (without +252 prefix). Used as default receiver when it matches the package's provider.
  const verifiedLoginPhone = React.useMemo(() => {
    return normalizeSomaliPhone(localStorage.getItem('verifiedPhone'));
  }, []);

  // Set receiver prefix when provider is loaded
  React.useEffect(() => {
    // 🔒 Package-level phone_prefix wins over provider default. Supports multiple prefixes: "61,77" or "61/77".
    const pkgPrefixRaw = (packageData as any)?.phonePrefix;
    if (pkgPrefixRaw && String(pkgPrefixRaw).trim()) {
      const prefixList = String(pkgPrefixRaw)
        .split(/[,\/\s]+/)
        .map((s) => s.replace(/\D/g, ''))
        .filter(Boolean);
      if (prefixList.length > 0) {
        const defaultPrefix = prefixList[0];
        setReceiverProviderPrefix(defaultPrefix);
        setAllowedReceiverPrefixes(prefixList);
        const stateReceiver = location.state?.receiverPhone;
        const matchesAny = (n: string) => prefixList.some((p) => n.startsWith(p));
        if (stateReceiver && matchesAny(stateReceiver)) {
          setReceiverNumber(stateReceiver);
        } else if (offlineReceiverPhone && matchesAny(offlineReceiverPhone)) {
          setReceiverNumber(offlineReceiverPhone);
        } else {
          setReceiverNumber(defaultPrefix);
        }
        return;
      }
    }

    // No package-level prefix — fall back to provider defaults / state
    const stateReceiver = location.state?.receiverPhone;
    if (stateReceiver) {
      setReceiverNumber(stateReceiver);
      setReceiverProviderPrefix(stateReceiver.substring(0, 2));
      setAllowedReceiverPrefixes([]);
      return;
    }
    // Compute provider-expected prefixes for receiver validation
    const providerPrefixes: string[] = isADSL
      ? ['1']
      : (providerName ? [getProviderPrefix(providerName), ...(providerName.toLowerCase().includes('hormuud') ? ['77'] : [])].filter(Boolean) : []);
    if (offlineReceiverPhone && offlineReceiverPhone.length >= 7 && providerPrefixes.length > 0 && providerPrefixes.some((p) => offlineReceiverPhone.startsWith(p))) {
      setReceiverNumber(offlineReceiverPhone);
      setReceiverProviderPrefix(offlineReceiverPhone.substring(0, 2));
      setAllowedReceiverPrefixes([]);
      return;
    }
    if (providerName) {
      if (isADSL) {
        setReceiverProviderPrefix('1');
        setReceiverNumber('1');
        setAllowedReceiverPrefixes(['1']);
      } else {
        const prefix = getProviderPrefix(providerName);
        setReceiverProviderPrefix(prefix);
        setReceiverNumber(prefix);
        setAllowedReceiverPrefixes([]);
      }
    }
  }, [providerName, isADSL, location.state, packageData, verifiedLoginPhone]);


  // Pre-fill sender phone: verified login phone first, then offline registration
  const offlineSenderRef = React.useRef(false);
  React.useEffect(() => {
    if (location.state?.senderPhone) {
      setPaymentNumber(location.state.senderPhone);
      offlineSenderRef.current = true;
    } else if (verifiedLoginPhone && verifiedLoginPhone.length === 9) {
      setPaymentNumber(verifiedLoginPhone);
      offlineSenderRef.current = true;
    } else if (offlineSenderPhone && offlineSenderPhone.length === 9) {
      setPaymentNumber(offlineSenderPhone);
      offlineSenderRef.current = true;
    }
  }, [location.state, verifiedLoginPhone]);

  const receiverAllowedPrefixes = useMemo(() => {
    if (allowedReceiverPrefixes.length > 0) return allowedReceiverPrefixes;
    if (isADSL) return ['1'];
    const isHormuudProvider = providerName?.toLowerCase().includes('hormuud');
    return isHormuudProvider ? ['61', '77'] : (receiverProviderPrefix ? [receiverProviderPrefix] : []);
  }, [allowedReceiverPrefixes, isADSL, providerName, receiverProviderPrefix]);

  const receiverPrefixText = receiverAllowedPrefixes.join(' ama ');
  const receiverMaxLength = isADSL ? 7 : 9;
  const receiverPrefixCheckLength = receiverAllowedPrefixes.length > 0
    ? Math.min(...receiverAllowedPrefixes.map(prefix => prefix.length))
    : 2;
  const receiverPlaceholder = receiverProviderPrefix
    ? `${receiverProviderPrefix}${'X'.repeat(Math.max(receiverMaxLength - receiverProviderPrefix.length, 0))}`
    : (isADSL ? '1XXXXXX' : 'XXXXXXXXX');

  const handlePaymentSelect = useCallback((paymentId: string) => {
    if (paymentRoute(paymentProviders.find(p => p.id === paymentId), isReallyOnline === true && !isOfflineFromState) === 'unavailable') {
      toast({ title: 'API wuxuu u baahan yahay internet', variant: 'destructive' });
      return;
    }
    setSelectedProvider(paymentId);
    setPaymentNumberError('');
    const selectedPayment = paymentProviders.find(p => p.id === paymentId);
    if (selectedPayment) {
      const prefix = selectedPayment.prefix_code || getProviderPrefix(selectedPayment.provider_name);
      setPaymentProviderPrefix(prefix);
      // Only set prefix if user doesn't have a pre-filled sender phone
      if (!offlineSenderRef.current) {
        setPaymentNumber(prefix);
      }
    }
  }, [paymentProviders, getProviderPrefix, isReallyOnline, isOfflineFromState]);
  const handlePaymentNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');

    if (value.length <= 9) {
      setPaymentNumber(value);
      
      // Validate if the number starts with the correct prefix
      const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
      const paymentProviderName = selectedPayment?.provider_name;
      
      // EVC (Hormuud) accepts both 61 and 77 prefixes
      const isEVC = paymentProviderName?.toLowerCase() === 'evc' || paymentProviderName?.toLowerCase().includes('evc');
      const isHormuud = paymentProviderName?.toLowerCase() === 'hormuud' || paymentProviderName?.toLowerCase().includes('hormuud');
      
      if (value.length >= 2) {
        if ((isEVC || isHormuud) && (value.startsWith('61') || value.startsWith('77'))) {
          setPaymentNumberError('');
        } else if (paymentProviderPrefix && !value.startsWith(paymentProviderPrefix)) {
          const acceptedPrefixes = (isEVC || isHormuud) ? '61 ama 77' : paymentProviderPrefix;
          setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${acceptedPrefixes})`);
        } else {
          setPaymentNumberError('');
        }
      } else {
        setPaymentNumberError('');
      }
    }
  }, [paymentProviders, selectedProvider, paymentProviderPrefix]);
  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length > receiverMaxLength) return;
    setReceiverNumber(value);

    // Live validation: package-level phone_prefix wins over ADSL/provider defaults.
    if (value.length >= receiverPrefixCheckLength && receiverAllowedPrefixes.length > 0 && !receiverAllowedPrefixes.some(p => value.startsWith(p))) {
      setReceiverNumberError(`Fadlan gali lambar bilaabanaya ${receiverPrefixText}`);
    } else {
      setReceiverNumberError('');
    }
  }, [receiverAllowedPrefixes, receiverMaxLength, receiverPrefixCheckLength, receiverPrefixText]);
  const handleProceedToPayment = useCallback(() => {
    if (!selectedProvider) {
      return;
    }
    setShowPaymentModal(true);
  }, [selectedProvider]);
  const handleShowConfirmation = async () => {
    let currentProviders = activePaymentProviders(paymentProviders);
    if (isReallyOnline === true && !isOfflineFromState) {
      try {
        currentProviders = await fetchActivePaymentProviders();
        queryClient.setQueryData(PAYMENT_QUERY_KEY, currentProviders);
      } catch {
        toast({ title: 'Hababka lacag-bixinta lama xaqiijin. Isku day mar kale.', variant: 'destructive' });
        return;
      }
    }
    if (!paymentNumber || !receiverNumber) {
      return;
    }
    
    // Validate payment number length (always 9 for payment)
    if (paymentNumber.length !== 9) {
      setPaymentNumberError('Fadlan gali lambarka oo dhan (9 digits)');
      return;
    }
    
    const hasPackagePrefix = allowedReceiverPrefixes.length > 0;

    // Package-level phone_prefix wins. Only use ADSL hardcoded length/prefix when package has no custom prefix.
    if (hasPackagePrefix) {
      if (receiverNumber.length !== receiverMaxLength) {
        setReceiverNumberError(`Fadlan gali lambarka oo dhan (${receiverMaxLength} digits)`);
        return;
      }
      if (!receiverAllowedPrefixes.some((p) => receiverNumber.startsWith(p))) {
        setReceiverNumberError(`Fadlan gali lambarka bilaabanaya ${receiverPrefixText}`);
        return;
      }
    } else if (isADSL) {
      if (receiverNumber.length !== 7) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay 7 lambar');
        return;
      }
      if (!receiverNumber.startsWith('1')) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        return;
      }
    } else {
      // Mobile receiver validation: 9 digits
      if (receiverNumber.length !== 9) {
        setReceiverNumberError('Fadlan gali lambarka oo dhan (9 digits)');
        return;
      }
      
      if (receiverAllowedPrefixes.length > 0 && !receiverAllowedPrefixes.some((p) => receiverNumber.startsWith(p))) {
        const acceptedPrefixes = receiverAllowedPrefixes.join(' ama ');
        setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${acceptedPrefixes})`);
        return;
      }
    }
    
    // Validate payment number prefix
    const selectedPayment = currentProviders.find(p => p.id === selectedProvider);
    const paymentProviderName = selectedPayment?.provider_name;
    
    // EVC (Hormuud) accepts both 61 and 77 prefixes
    const isEVC = paymentProviderName?.toLowerCase() === 'evc' || paymentProviderName?.toLowerCase().includes('evc');
    const isHormuud = paymentProviderName?.toLowerCase() === 'hormuud' || paymentProviderName?.toLowerCase().includes('hormuud');
    
    if ((isEVC || isHormuud) && (paymentNumber.startsWith('61') || paymentNumber.startsWith('77'))) {
      // Valid EVC/Hormuud number
    } else if (paymentProviderPrefix && !paymentNumber.startsWith(paymentProviderPrefix)) {
      const acceptedPrefixes = (isEVC || isHormuud) ? '61 ama 77' : paymentProviderPrefix;
      setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${acceptedPrefixes})`);
      return;
    }

    // Discovery root package: scan the operator menu for this receiver before payment
    if (packageData?.isDiscoveryRoot && !packageData?.discoveryLabel) {
      navigate(`/discover/${provider}`, {
        state: {
          rootPackage: packageData,
          providerName,
          senderPhone: paymentNumber,
          receiverPhone: receiverNumber,
          paymentProviderId: selectedProvider,
        },
      });
      return;
    }

    // Generate USSD code for display on confirmation screen

    const formatUssdAmountForDisplay = (amt: string): string => {
      const numAmount = parseFloat(amt);
      const dollars = Math.floor(numAmount);
      const cents = Math.round((numAmount - dollars) * 100);
      return `${dollars}*${cents.toString().padStart(2, '0')}`;
    };

    const getUssdPrefixForDisplay = (providerName: string): string => {
      const name = providerName.toLowerCase();
      if (name.includes('evc')) return '*712*';
      if (name.includes('jeeb')) return '*812*';
      return '*712*'; // default to EVC
    };

    const selectedPaymentProvider = currentProviders.find(p => p.id === selectedProvider);
    if (!selectedPaymentProvider) {
      toast({ title: 'Dooro hab lacag-bixin oo shaqaynaya', variant: 'destructive' });
      return;
    }
    if (isApiPayment(selectedPaymentProvider)) {
      if (isReallyOnline !== true || isOfflineFromState) {
        toast({ title: 'API wuxuu u baahan yahay internet', variant: 'destructive' });
        return;
      }
      setUssdCodeForDisplay('');
      playConfirmationVoice();
      setShowPaymentModal(false);
      setShowConfirmationScreen(true);
      return;
    }
    const displayAmount = packageData?.price?.replace('$', '') || '0';
    const formattedDisplayAmount = formatUssdAmountForDisplay(displayAmount);
    const displayUssdPrefix = getUssdPrefixForDisplay(selectedPaymentProvider?.provider_name || '');
    // Get correct payment number based on provider
    // Use payment_number from database (admin-configured), fallback to first provider
    const displayPaymentNumber = selectedPaymentProvider?.payment_number || currentProviders[0]?.payment_number || '';
    const generatedUssdCode = `${displayUssdPrefix}${displayPaymentNumber}*${formattedDisplayAmount}#`;
    setUssdCodeForDisplay(generatedUssdCode);

    playConfirmationVoice();
    setShowPaymentModal(false);
    setShowConfirmationScreen(true);
  };

  // Coming back from *212* discovery: go straight to the confirmation screen
  const autoConfirmed = useRef(false);
  useEffect(() => {
    if (autoConfirmed.current) return;
    if (!location.state?.autoConfirm) return;
    if (!packageData?.discoveryLabel) return;
    if (!paymentNumber || !receiverNumber || !selectedProvider) return;
    autoConfirmed.current = true;
    handleShowConfirmation();
  }, [location.state, packageData, paymentNumber, receiverNumber, selectedProvider]);

  const handlePaymentComplete = async () => {
    if (paymentInFlightRef.current) return;
    setErrorTitle(undefined);
    setCanRetryPayment(true);
    let currentProviders = activePaymentProviders(paymentProviders);
    const previousProvider = currentProviders.find(p => p.id === selectedProvider);
    if (isReallyOnline === true && !isOfflineFromState) {
      try {
        currentProviders = await fetchActivePaymentProviders();
        queryClient.setQueryData(PAYMENT_QUERY_KEY, currentProviders);
      } catch {
        setErrorType('general');
        setErrorMessage('Habka lacag-bixinta lama xaqiijin. Isku day mar kale.');
        setShowErrorModal(true);
        return;
      }
    }
    const selectedPaymentProvider = currentProviders.find(p => p.id === selectedProvider);
    if (!selectedPaymentProvider || previousProvider?.payment_mode !== selectedPaymentProvider?.payment_mode) {
      setShowConfirmationScreen(false);
      setShowPaymentModal(false);
      toast({ title: 'Habka lacag-bixinta waa la beddelay. Mar kale dooro.', variant: 'destructive' });
      return;
    }
    const amount = packageData?.price?.replace('$', '') || '0';

    // API selection is resolved before either online or offline USSD handling.
    const route = paymentRoute(selectedPaymentProvider, isReallyOnline === true && !isOfflineFromState);
    if (route === 'unavailable') {
      setErrorType('general');
      setErrorMessage('Habkan lacag-bixinta hadda lama heli karo. Hubi internet-ka ama dooro hab kale.');
      setShowErrorModal(true);
      return;
    }
    if (route === 'api') {
      if (paymentInFlightRef.current) return;
      paymentInFlightRef.current = true;
      setIsProcessingPayment(true);
      // Keep an uncertain attempt across Maamuus re-scans too. The backend checks
      // its original scan/index; changing an offer must not silently start a new debit.
      const key = 'al-islaam-api-attempt:' + JSON.stringify([selectedPaymentProvider.payment_mode, selectedProvider, packageData?.id, paymentNumber, receiverNumber, scheduledFor?.toISOString() || null]);
      let clientReference = '';
      try {
        clientReference = localStorage.getItem(key) || crypto.randomUUID();
        // Persist before sending, so a reload/network failure cannot charge twice.
        localStorage.setItem(key, clientReference);
        const purchaseInput = {
          client_reference: clientReference,
          payer_phone: paymentNumber, receiver_phone: receiverNumber,
          customer_phone: verifiedLoginPhone || normalizeSomaliPhone(offlineSenderPhone) || normalizeSomaliPhone(paymentNumber),
          package_id: packageData?.id, payment_provider_id: selectedProvider,
          scheduled_for: scheduledFor?.toISOString() || null,
        };
        const result = selectedPaymentProvider.payment_mode === 'edahab_api'
          ? await purchaseWithEdahab(purchaseInput)
          : await purchaseWithWaafiPay({
              ...purchaseInput,
              ...(packageData?.discoveryLabel ? { discovery_id: packageData.discoveryId,
                discovery_index: String(packageData.discoveryIndex), expected_price: packageData.discoveryPrice } : {}),
            });
        if (result.delivery_queued) localStorage.removeItem(key);
        setShowConfirmationScreen(false);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        toast({
          title: 'Lacagta waa la xaqiijiyey',
          description: result.delivery_queued
            ? (scheduledFor ? 'Xirmada waa la jadwaleeyey.' : 'Xirmada waa la dirayaa.')
            : 'Dirista xirmada adeegga macaamiisha ha hubiyo. Lacagta ha ku celin.',
        });
        navigate('/');
      } catch (error: any) {
        // Only a definite decline can start a new payment attempt.
        if (error?.safeToRetry === true) localStorage.removeItem(key);
        setErrorType(error?.errorType || 'general');
        setErrorTitle(error?.title);
        setCanRetryPayment(error?.safeToRetry === true);
        setErrorMessage(error?.message || 'Lacag-bixinta API lama xaqiijin.');
        setShowErrorModal(true);
      } finally {
        paymentInFlightRef.current = false;
        setIsProcessingPayment(false);
      }
      return;
    }

    // Show full-screen loading immediately
    setIsProcessingPayment(true);

  // ========== OFFLINE MODE DETECTION ==========
    if (!isReallyOnline || isOfflineFromState) {
      console.log('📴 Offline mode - generating USSD code');
      
      try {
        // Convert amount like "0.09" to "0*09" or "5.00" to "5*00"
        const formatUssdAmountOffline = (amt: string): string => {
          const numAmount = parseFloat(amt);
          const dollars = Math.floor(numAmount);
          const cents = Math.round((numAmount - dollars) * 100);
          return `${dollars}*${cents.toString().padStart(2, '0')}`;
        };
        
        // Get provider-specific USSD prefix for offline
        const getUssdPrefixOffline = (providerName: string): string => {
          const name = providerName.toLowerCase();
          if (name.includes('evc')) return '*712*';
          if (name.includes('jeeb')) return '*812*';
          return '*712*'; // default to EVC
        };
        
        const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
        const ussdPrefix = getUssdPrefixOffline(selectedPayment?.provider_name || '');
        const formattedAmount = formatUssdAmountOffline(amount);
        // Company payment number (admin-configured) - where money goes TO
        const companyPaymentNum = selectedPayment?.payment_number || paymentProviders[0]?.payment_number || '';
        
        const ussdCode = `${ussdPrefix}${companyPaymentNum}*${formattedAmount}#`;
        
        // customer_phone = app login phone (verifiedPhone)
        const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
        const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
        
        // sender_phone = user's phone they're paying FROM (state paymentNumber, NOT company number)
        const userSenderPhone = paymentNumber; // state variable - user's entered payment phone
        
        const offlineOrderData = {
            customer_phone: customerPhone || userSenderPhone, // app login phone, fallback to sender
            sender_phone: userSenderPhone,       // phone user pays FROM
            receiver_phone: receiverNumber,       // phone that gets the data package
            package_id: packageData?.id || '',
            provider_id: packageData?.providerId || '',
            payment_provider_id: selectedProvider,
            package_name: packageData?.name || 'Data Package',
            data_amount: packageData?.data || '',
            selling_price: parseFloat(amount),
            payment_number: companyPaymentNum,    // company number where money is sent TO
            status: 'pending_payment',
            delivery_status: 'pending'
          };
        queueOrder(offlineOrderData as any);

        // offline: order queued locally

        // Close confirmation and navigate to home
        setShowConfirmationScreen(false);
        navigate('/');
        
        // Open USSD dialer
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;

        return;
      } catch (error: any) {
        console.error('Offline payment error:', error);
        setErrorType('general');
        setErrorMessage('Khalad ayaa dhacay. Fadlan isku day mar kale.');
        setShowErrorModal(true);
        return;
      }
    }
    // ========== END OFFLINE MODE ==========

    try {
      // ========================================
      // FAIL-SAFE TRANSACTION GUARD
      // Step 1: Insert pending_online_payments with RETRY (3 attempts)
      // USSD MUST NOT open unless this succeeds
      // ========================================
      console.log('🆕 Creating order with Fail-Safe Transaction Guard');
      
      const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
      const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
      
      // Use payment_number from database (admin-configured) for USSD code
      const companyPaymentNumber = selectedPaymentProvider?.payment_number || paymentProviders[0]?.payment_number || '';

      const cleanCustomerPaymentPhone = paymentNumber.startsWith('+252') ? paymentNumber.substring(4) : paymentNumber.startsWith('0') ? paymentNumber.substring(1) : paymentNumber;
      
      const pendingPaymentData = {
        verified_phone: customerPhone,
        sender_phone: cleanCustomerPaymentPhone,
        receiver_phone: receiverNumber,
        provider_id: packageData?.providerId,
        package_id: packageData?.id,
        payment_provider: selectedPaymentProvider?.provider_name || '',
        expected_amount: parseFloat(amount),
        status: 'pending',
        scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
        discovery_menu_label: packageData?.discoveryLabel || null,
        discovery_menu_index: packageData?.discoveryIndex != null ? String(packageData.discoveryIndex) : null,
      };

      // DEDUP CHECK: Skip if a pending payment already exists for same sender+package+amount (last 10 min)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existingPending } = await supabase
        .from('pending_online_payments')
        .select('id')
        .eq('sender_phone', cleanCustomerPaymentPhone)
        .eq('expected_amount', parseFloat(amount))
        .eq('status', 'pending')
        .gte('created_at', tenMinutesAgo)
        .limit(1);

      if (existingPending && existingPending.length > 0) {
        console.log('⚠️ Duplicate pending payment detected, skipping insert. Existing ID:', existingPending[0].id);
      } else {
        // STRICT RETRY: 3 attempts, 500ms apart. USSD blocked until success.
        let insertSuccess = false;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { error: pendingError } = await supabase
              .from('pending_online_payments')
              .insert([pendingPaymentData]);

            if (pendingError) {
              lastError = pendingError;
              console.warn(`⚠️ Attempt ${attempt}/3 failed:`, pendingError.message);
              if (attempt < 3) await new Promise(r => setTimeout(r, 500));
            } else {
              insertSuccess = true;
              console.log(`✅ Pending payment registered on attempt ${attempt}`);
              break;
            }
          } catch (dbError: any) {
            lastError = dbError;
            console.warn(`⚠️ Attempt ${attempt}/3 exception:`, dbError);
            if (attempt < 3) await new Promise(r => setTimeout(r, 500));
          }
        }

        // HARD STOP: If all retries failed, DO NOT open USSD
        if (!insertSuccess) {
          console.error('❌ All 3 insert attempts failed. USSD BLOCKED.');
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage('Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.');
          setShowErrorModal(true);
          return;
        }
      }

      // ========================================
      // Step 2: Generate USSD code (only reached on success)
      // ========================================
      const formatUssdAmount = (amt: string): string => {
        const numAmount = parseFloat(amt);
        const dollars = Math.floor(numAmount);
        const cents = Math.round((numAmount - dollars) * 100);
        return `${dollars}*${cents.toString().padStart(2, '0')}`;
      };
      
      const getUssdPrefix = (providerName: string): string => {
        const name = providerName.toLowerCase();
        if (name.includes('evc')) return '*712*';
        if (name.includes('jeeb')) return '*812*';
        return '*712*';
      };
      
      const ussdPrefix = getUssdPrefix(selectedPaymentProvider?.provider_name || '');
      const formattedAmount = formatUssdAmount(amount);
      const ussdCode = `${ussdPrefix}${companyPaymentNumber}*${formattedAmount}#`;
      console.log('📞 USSD Code generated:', ussdCode);

      // ========================================
      // Step 3: Open USSD dialer (ONLY after confirmed DB insert)
      // ========================================
      setShowConfirmationScreen(false);
      setIsProcessingPayment(false);
      if (scheduledFor) {
        toast({
          title: '⏰ La qorsheeyay',
          description: `Xirmada waxaa la dirayaa: ${formatDate(scheduledFor, 'PPP p')}`,
        });
      }
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
      
      if (Capacitor.isNativePlatform()) {
        navigate('/');
      } else {
        setTimeout(() => navigate('/'), 1200);
      }

    } catch (error: any) {
      console.error('Payment error:', error);
      setIsProcessingPayment(false);
      setShowErrorModal(false);
      setShowConfirmationScreen(false);
      
      setTimeout(() => {
        setErrorType('general');
        setErrorMessage(error.message || 'Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.');
        setShowErrorModal(true);
      }, 100);
    }
  };
return <div className="min-h-screen bg-[#efefef] pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName || '')} text-white py-4 px-4`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Dooro habka lacag bixinta</h1>
        </div>
      </div>

      {/* Payment Providers */}
      <div className="p-4 space-y-3 mt-4">
        {isReallyOnline !== true && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              📵 Offline Mode: USSD kaliya ayaa la isticmaali karaa
            </p>
          </div>
        )}
        {activePaymentProviders(paymentProviders)
          .filter(payment => paymentRoute(payment, isReallyOnline === true && !isOfflineFromState) !== 'unavailable')
          .map(payment => <div key={payment.id} onClick={() => handlePaymentSelect(payment.id)} className={`bg-white rounded-2xl p-4 flex items-center justify-between cursor-pointer border-2 transition-all shadow-lg hover:shadow-xl ${selectedProvider === payment.id ? 'border-primary shadow-xl scale-105' : 'border-transparent'}`} style={{
        boxShadow: selectedProvider === payment.id ? '0 10px 25px rgba(0, 153, 255, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
              <div className="flex items-center">
                <div className="w-16 h-12 mr-4 flex items-center justify-center bg-gray-50 rounded-lg">
                  {payment.provider_logo && <img src={payment.provider_logo} alt={payment.provider_name} className="w-full h-full object-contain" loading="eager" decoding="async" />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{payment.provider_name}</h3>
                  {isReallyOnline !== true && payment.ussd_code_template && (
                    <p className="text-xs text-muted-foreground">USSD Code</p>
                  )}
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedProvider === payment.id ? 'bg-primary border-primary scale-110' : 'border-muted-foreground'}`}>
                {selectedProvider === payment.id && <Check className="w-5 h-5 text-primary-foreground" />}
              </div>
            </div>)}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-medium mb-4 text-center">
              {paymentProviders.find(p => p.id === selectedProvider)?.provider_name || 'Faahfaahinta lacag bixinta'}
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="payment-number" className="text-sm font-medium text-foreground">Gali Lambarka aad lacagta ka direyso</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="payment-number" 
                  type="tel" 
                  placeholder={paymentProviderPrefix ? `${paymentProviderPrefix}XXXXXXX` : 'XXXXXXXXX'}
                  value={paymentNumber} 
                  onChange={handlePaymentNumberChange} 
                  maxLength={9} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${paymentNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {paymentNumberError && (
                <div className="flex items-start gap-2 p-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">{paymentNumberError}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receiver-number" className="text-sm font-medium text-foreground">
                {isADSL && allowedReceiverPrefixes.length === 0
                  ? 'Gali Lambarka ADSL-ka (7 lambar bilaabanaya 1)'
                  : 'Gali Lambarka xirmada lagu shubaayo'}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="receiver-number" 
                  type="tel" 
                  placeholder={receiverPlaceholder}
                  value={receiverNumber} 
                  onChange={handleReceiverNumberChange} 
                  maxLength={receiverMaxLength} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${receiverNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {receiverNumberError ? (
                <div className="flex items-start gap-2 p-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">{receiverNumberError}</p>
                </div>
              ) : receiverPrefixText ? (
                <p className="text-xs text-muted-foreground">Lambarku waa inuu ku bilaabmaa {receiverPrefixText}</p>
              ) : isADSL && allowedReceiverPrefixes.length === 0 ? (
                <p className="text-xs text-muted-foreground">ADSL: 7 lambar, tusaale: 1234567</p>
              ) : null}
            </div>
            
            {/* Schedule delivery for later */}
            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">⏰ Jadwalee Dalabkaaga</p>
                  <p className="text-xs text-muted-foreground">Lacagta hadda ayaad bixinaysaa. Xirmada ayaa la dirayaa waqtiga aad dooratay.</p>
                </div>
                <Switch
                  checked={scheduleEnabled}
                  onCheckedChange={(v) => {
                    setScheduleEnabled(v);
                    if (!v) { setScheduleDate(undefined); setScheduleTime(''); }
                  }}
                />
              </div>
              {scheduleEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('w-full min-w-0 justify-start text-left font-normal px-2 overflow-hidden', !scheduleDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">{scheduleDate ? formatDate(scheduleDate, 'PPP') : 'Dooro taariikhda'}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full"
                  />
                  {scheduledFor && (
                    <p className="col-span-2 text-xs text-foreground">
                      Xirmada waxaa la dirayaa: <span className="font-semibold">{formatDate(scheduledFor, 'PPP p')}</span>
                    </p>
                  )}
                  {scheduleDate && scheduleTime && !scheduleIsValid && (
                    <p className="col-span-2 text-xs text-destructive">
                      Fadlan dooro waqti saxan.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">

              <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onPointerDown={playConfirmationVoice}
                onTouchStart={playConfirmationVoice}
                onClick={handleShowConfirmation}
                disabled={!scheduleIsValid}
                className="flex-1 gradient-button text-white disabled:opacity-50"
              >
                Pay Now
              </Button>
            </div>
          </div>
        </div>}

      {/* Confirmation Screen */}
      {showConfirmationScreen && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            {/* Package Details Card */}
            <div className="bg-white dark:bg-card rounded-lg border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{packageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`}>{packageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Payment Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(paymentNumber).logo ? <img src={getProviderFromPrefix(paymentNumber).logo} alt={getProviderFromPrefix(paymentNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(paymentNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{paymentNumber}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(receiverNumber).logo ? <img src={getProviderFromPrefix(receiverNumber).logo} alt={getProviderFromPrefix(receiverNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(receiverNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{receiverNumber}</span>
              </div>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {packageData?.price} ka dirtid {paymentNumber}?
              </p>
            </div>



            {/* USSD applies only to the selected USSD payment method. */}
            {selectedIsApi ? <div className="rounded-lg border border-border bg-muted p-3 text-center text-sm">
              Xaqiiji lacag-bixinta {paymentProviders.find(p => p.id === selectedProvider)?.provider_name || 'API'} ee taleefankaaga.
            </div> : <div className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border">
              <code className="text-lg font-bold text-primary select-all">
                {ussdCodeForDisplay}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(ussdCodeForDisplay);
                  toast({
                    title: "La copy-gareeye!",
                    description: "USSD code-ka la copy-gareeye",
                  });
                }}
                className="ml-2"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>

            }

            {/* Processing Indicator */}
            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  try { activeConfirmationAudioRef.current?.pause(); if (activeConfirmationAudioRef.current) activeConfirmationAudioRef.current.currentTime = 0; } catch {}
                  try { activeVoiceSourceRef.current?.stop(); } catch {}
                  activeVoiceSourceRef.current = null;
                  setShowVoiceReplay(false);
                  setShowConfirmationScreen(false);
                  if (packageData?.discoveryLabel) {
                    navigate(-1);
                    return;
                  }
                  setShowPaymentModal(true);
                }} 

                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={() => {
                  if (isProcessingPayment) return;
                  if (!scheduleIsValid) return;
                  try { activeConfirmationAudioRef.current?.pause(); if (activeConfirmationAudioRef.current) activeConfirmationAudioRef.current.currentTime = 0; } catch {}
                  try { activeVoiceSourceRef.current?.stop(); } catch {}
                  activeVoiceSourceRef.current = null;
                  handlePaymentComplete();
                }}
                disabled={isProcessingPayment || !scheduleIsValid}
                className="flex-1 py-5 text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 HAA IIBSO
              </Button>
            </div>
          </div>
        </div>}

      <audio
        ref={confirmationAudioRef}
        src={CONFIRMATION_VOICE_URL}
        preload="auto"
        playsInline
        hidden
      />

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-8 bg-[#efefef]">
        <Button onClick={handleProceedToPayment} className="w-full gradient-button text-white font-semibold py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">
          {selectedProvider ? `Bixi Hada ${packageData?.price}` : 'Dooro habka lacag bixinta'}
        </Button>
      </div>

      <PaymentLoadingOverlay isLoading={isProcessingPayment} />

      {/* Payment Error Modal */}
      <PaymentErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
          setShowConfirmationScreen(true);
          playConfirmationVoice();
        }}
        errorType={errorType}
        errorMessage={errorMessage}
        errorTitle={errorTitle}
        canRetry={canRetryPayment}
      />

      {/* Offline Phone Input Sheet */}
      <OfflinePhoneInputSheet 
        open={showOfflineSheet} 
        onOpenChange={setShowOfflineSheet}
      />
    </div>;
};
export default PaymentProviders;
