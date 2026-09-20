import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import RotatingBanner from '@/components/RotatingBanner';
import ProviderCard from '@/components/ProviderCard';
import PopularPackages from '@/components/PopularPackages';
import { Phone, MessageCircle, WifiOff, X, RefreshCw, Headphones, Bot, Search, CalendarClock, Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery, QueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { BottomNavigation } from '@/components/BottomNavigation';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import alIslaamLogo from '@/assets/al-islaam-logo.png';
import { useSupportContacts } from '@/hooks/useSupportContacts';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
}

const ProviderSelection = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const support = useSupportContacts();
  const { isReallyOnline } = useConnectivity();
  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);

  
  // Pull to refresh state
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const PULL_THRESHOLD = 80;
  
  useEffect(() => {
    showBannerAd();
    logScreenView('ProviderSelection');
    return () => { hideBannerAd(); };
  }, []);

  // Realtime: providers_config changes
  useEffect(() => {
    const channel = supabase
      .channel('providers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'providers_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['providers'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_packages_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['packages'] });
        queryClient.invalidateQueries({ queryKey: ['featuredPackages'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const getCachedProviders = () => {
    try {
      const cached = localStorage.getItem('offline_providers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      if (isReallyOnline === false) {
        return getCachedProviders();
      }

      const { data, error } = await supabase.rpc('get_active_providers');
      if (error) throw error;

      const freshProviders = data || [];
      localStorage.setItem('offline_providers', JSON.stringify(freshProviders));
      return freshProviders;
    },
    placeholderData: getCachedProviders,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });

  useEffect(() => {
    if (providers.length) {
      // Prefetch categories for each provider
      providers.forEach((p: Provider) => {
        queryClient.prefetchQuery({
          queryKey: ['categories', p.id],
          queryFn: async () => {
            const { data, error } = await supabase.rpc('get_active_categories', { p_provider_id: p.id });
            if (error) throw error;
            return data || [];
          },
          staleTime: 5 * 60 * 1000
        });
      });
      providers.forEach((p: Provider) => {
        queryClient.prefetchQuery({
          queryKey: ['packages', p.id],
          queryFn: async () => {
            const { data, error } = await supabase.rpc('get_public_packages', { p_provider_id: p.id });
            if (error) throw error;
            return data || [];
          },
          staleTime: 60 * 1000
        });
        queryClient.prefetchQuery({
          queryKey: ['promotionalText', p.id],
          queryFn: async () => {
            const { data, error } = await supabase.from('providers_config').select('promotional_text').eq('id', p.id).maybeSingle();
            if (error) throw error;
            return data?.promotional_text || 'Al-islaam Data ka iibso Internet adigoona qof wicin, waqti kasta!';
          },
          staleTime: 10 * 60 * 1000
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['providers'] });
      await queryClient.invalidateQueries({ queryKey: ['featuredPackages'] });
      await queryClient.invalidateQueries({ queryKey: ['banners'] });
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [queryClient]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    if (distance > 0 && contentRef.current?.scrollTop === 0) {
      setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  }, [pullDistance, isRefreshing, handleRefresh]);

  const detectProvider = (phone: string): { id: string; name: string } | null => {
    if (phone.length < 2) return null;
    const prefix = phone.substring(0, 2);
    const providerMap: { [key: string]: { id: string; name: string } } = {
      '61': { id: 'hormuud', name: 'Hormuud' },
      '68': { id: 'somnet', name: 'Somnet' },
      '62': { id: 'somtel', name: 'Somtel' },
      '71': { id: 'amtel', name: 'Amtel' },
      '64': { id: 'somlink', name: 'Somlink' }
    };
    return providerMap[prefix] || null;
  };

  const handleOfflineModeClick = () => {
    const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
    const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';
    
    if (savedSenderPhone && savedReceiverPhone) {
      const provider = detectProvider(savedReceiverPhone);
      if (provider) {
        toast({
          title: "Lambarada hore ayaa la isticmaalayo",
          description: `Diraha: ${savedSenderPhone} | Heelaha: ${savedReceiverPhone}`,
          duration: 3000,
        });
        navigate(`/categories/${provider.id}`, {
          state: { providerName: provider.name, senderPhone: savedSenderPhone, receiverPhone: savedReceiverPhone, isOffline: true }
        });
        return;
      }
    }
    navigate('/offline-mode');
  };

  const handleProviderSelect = (providerId: string, providerName: string) => {
    if (providerName.toLowerCase().includes('offline')) {
      handleOfflineModeClick();
      return;
    }
    if (isReallyOnline === false) {
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 3000);
      return;
    }
    navigate(`/categories/${providerId}`, { state: { providerName } });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Green */}
      <div 
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'hsl(var(--primary))',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
          boxSizing: 'border-box' as const
        }}
      >
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Al-islaam</h1>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigate('/scheduled-orders')}
                className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
                aria-label="Scheduled Orders"
              >
                <CalendarClock className="w-6 h-6 text-white" />
              </button>
              <button 
                onClick={() => navigate('/referral')}
                className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
                aria-label="Referral Program"
              >
                <Gift className="w-6 h-6 text-white" />
              </button>
              <button 
                onClick={() => navigate('/ai-chat')}
                className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
                aria-label="AI Chat"
              >
                <Bot className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>


      </div>

      {/* Scrollable Content */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        style={{ 
          paddingTop: 'calc(4.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' 
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to refresh */}
        <div 
          className="flex items-center justify-center transition-all duration-200"
          style={{ height: pullDistance > 0 ? `${pullDistance}px` : 0, opacity: pullDistance > 20 ? 1 : 0 }}
        >
          <RefreshCw className={`w-5 h-5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} 
            style={{ transform: `rotate(${pullDistance * 2}deg)` }}
          />
        </div>

        {/* Banner */}
        <div className="px-4 pt-2 pb-3">
          <RotatingBanner />
        </div>

        {/* Offline Warning */}
        {showOfflineToast && (
          <div className="mx-4 mb-3 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-500 rounded-2xl flex items-start gap-2 animate-in slide-in-from-top">
            <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Internet ma hayso!</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Fadlan isticmaal <span className="font-bold">Offline Mode</span> oo hoos ku yaal →
              </p>
            </div>
          </div>
        )}

        {/* Providers Section */}
        <div className="px-4 space-y-4">
          <h2 className="text-xl font-bold text-foreground">Dooro shirkada aa rabtid</h2>
          
          <div className="grid grid-cols-3 gap-3">
            {providers.map((provider: Provider) => (
              <div key={provider.id} className={isReallyOnline === false ? 'opacity-60' : ''}>
                <ProviderCard 
                  name={provider.provider_name} 
                  logo={provider.provider_logo || ''} 
                  onClick={() => handleProviderSelect(provider.id, provider.provider_name)}
                  disabled={isReallyOnline === false}
                />
              </div>
            ))}
            
            {/* Offline Mode Card */}
            <button 
              onClick={handleOfflineModeClick}
              style={{ minHeight: '96px' }}
              className={`relative w-full rounded-xl p-2 flex flex-col items-center justify-between bg-accent transition-all duration-200 active:scale-[0.97] ${
                isReallyOnline === false ? 'animate-bounce ring-2 ring-accent shadow-lg' : ''
              }`}
            >
              <div className="flex-1 w-full flex items-center justify-center">
                <div className="w-10 h-10 bg-white/25 rounded-full flex items-center justify-center">
                  <WifiOff className="w-5 h-5 text-accent-foreground" />
                </div>
              </div>
              <span className="text-accent-foreground font-medium text-[13px] pb-0.5">Offline Mode</span>
            </button>
          </div>
        </div>

        {/* Popular Packages */}
        <div className="px-4 mt-6 mb-4">
          <PopularPackages />
        </div>
      </div>

      {/* Support FAB */}
      <button
        onClick={() => setShowContactSheet(!showContactSheet)}
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300 ${
          showContactSheet ? 'bg-destructive' : ''
        }`}
        style={!showContactSheet ? { background: 'linear-gradient(135deg, hsl(var(--accent)), hsl(262 90% 45%))' } : {}}
      >
        {showContactSheet ? (
          <X className="w-7 h-7 text-white" />
        ) : (
          <>
            <Headphones className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-extrabold rounded-full w-5 h-5 flex items-center justify-center">
              24
            </span>
          </>
        )}
      </button>

      {/* Contact Popup */}
      {showContactSheet && (
        <div className="fixed bottom-40 right-4 z-40 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <a 
            href={support.callUrl}
            onClick={() => setShowContactSheet(false)}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            style={{ background: 'linear-gradient(135deg, hsl(var(--accent)), hsl(262 90% 45%))' }}
          >
            <Phone className="w-7 h-7 text-white" />
          </a>
          <button
            onClick={() => setShowContactSheet(false)}
            className="w-8 h-8 bg-destructive rounded-full flex items-center justify-center shadow-md"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <a 
            href={support.whatsappUrl} target="_blank" rel="noopener noreferrer"
            onClick={() => setShowContactSheet(false)}
            className="w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <MessageCircle className="w-7 h-7 text-white" />
          </a>
        </div>
      )}

      <BottomNavigation />
    </div>
  );
};

export default ProviderSelection;