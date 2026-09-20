import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useOfflineCache } from '@/hooks/useOfflineCache';
const alIslaamLogoSplash = '/images/al-islaam-splash-logo.png';

 // Validate Somali phone format: 9 digits starting with 61, 77, 62, or 68
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const Index = () => {
  const navigate = useNavigate();
  
  // Check if app was already initialized in this session
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  
  // If already initialized, skip splash entirely
  const [isChecking, setIsChecking] = useState(() => {
    if (wasAlreadyInitialized) {
      return false;
    }
    return true; // Show splash only for first-time app open
  });
  const hasInitialized = useRef(false);

  // Check if user has completed offline registration or skipped it
  const hasOfflineRegistration = (): boolean => {
    const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
    if (hasSkipped) return true;
    const sender = localStorage.getItem('offlineSenderPhone');
    const receiver = localStorage.getItem('offlineReceiverPhone');
    return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
  };

  // Handle already initialized case - immediate navigation
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    if (wasAlreadyInitialized) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      }
      return;
    }
  }, [navigate, wasAlreadyInitialized]);

// Get connectivity status - ping runs in background
  const { isReallyOnline, isChecking: connectivityChecking } = useConnectivity();
  const { forceRefreshCache } = useOfflineCache();
  
  // Force refresh cache during splash screen
  const splashRefreshDone = useRef(false);
  useEffect(() => {
    if (!splashRefreshDone.current && isReallyOnline && isChecking) {
      splashRefreshDone.current = true;
      forceRefreshCache();
    }
  }, [isReallyOnline, isChecking]);
  
  // Track if minimum splash time has passed (2 seconds - fast internet)
  const [splashMinimumReached, setSplashMinimumReached] = useState(false);
  
  // Extended splash for slow/no internet (4 seconds)
  const [extendedSplashReached, setExtendedSplashReached] = useState(false);
  
  // Safety net - force exit after 8 seconds MAX (4s splash + 4s skeleton)
  const [forceExit, setForceExit] = useState(false);

  // Minimum 2 second splash timer (fast internet case)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const splashTimer = setTimeout(() => {
      setSplashMinimumReached(true);
    }, 2000); // 2 seconds
    
    return () => clearTimeout(splashTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Extended 4 second splash timer (data on + no internet case)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const extendedTimer = setTimeout(() => {
      setExtendedSplashReached(true);
    }, 4000); // 4 seconds
    
    return () => clearTimeout(extendedTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Safety timer - 8 seconds MAX (4s splash + 4s skeleton)
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    
    const forceTimer = setTimeout(() => {
      setForceExit(true);
    }, 8000);
    
    return () => clearTimeout(forceTimer);
  }, [wasAlreadyInitialized, isChecking]);

  // Navigation logic - 2 different paths based on connectivity speed
  useEffect(() => {
    if (wasAlreadyInitialized) return;
    if (!isChecking) return;
    if (!splashMinimumReached) return; // Min 2 seconds always
    
    // CASE 1: Fast Internet - ping done + online = navigate after 2s
    if (!connectivityChecking && isReallyOnline) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        sessionStorage.setItem('appInitialized', 'true');
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      } else {
        if (verifiedPhone) localStorage.removeItem('verifiedPhone');
        sessionStorage.setItem('appInitialized', 'true');
        setIsChecking(false);
      }
      return;
    }
    
    // CASE 2: Data ON + No Internet - wait for 4s splash, then skeleton, then offline
    if (!extendedSplashReached) return; // Sug 4s splash
    
    // After 4s: if offline confirmed OR forceExit
    if (forceExit || (!connectivityChecking && !isReallyOnline)) {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      
      if (isValidSomaliPhone(verifiedPhone)) {
        sessionStorage.setItem('appInitialized', 'true');
        // Check if offline registration is complete
        if (hasOfflineRegistration()) {
          navigate('/providers', { replace: true });
        } else {
          navigate('/offline-mode', { replace: true });
        }
      } else {
        if (verifiedPhone) localStorage.removeItem('verifiedPhone');
        sessionStorage.setItem('appInitialized', 'true');
        setIsChecking(false);
      }
    }
  }, [navigate, wasAlreadyInitialized, isChecking, splashMinimumReached, extendedSplashReached, connectivityChecking, isReallyOnline, forceExit]);

  // Show splash screen
  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-[#008000] flex flex-col items-center justify-center z-50">
        <img 
          src={alIslaamLogoSplash} 
          alt="Al-islaam Data" 
          className="w-36 h-36 rounded-2xl animate-pulse"
        />
        <div className="w-10 h-10 mt-10 border-4 border-[#000000]/30 border-t-[#000000] rounded-full animate-spin" />
        
        {/* Skeleton loading - muuji kadib 4s splash, inta ping wali socoto */}
        {extendedSplashReached && connectivityChecking && !forceExit && (
          <div className="flex flex-col items-center mt-6">
            <div className="w-48 h-2 bg-[#000000]/20 rounded-full overflow-hidden">
              <div className="h-full bg-[#000000]/70 rounded-full animate-pulse" style={{width: '70%'}} />
            </div>
            <p className="text-[#000000]/70 text-xs mt-2">Xiriirka la hubinayo...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-6 gap-4">
      <div className="w-full max-w-md space-y-5">
        <HeroSection />
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
          <PhoneInput />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
