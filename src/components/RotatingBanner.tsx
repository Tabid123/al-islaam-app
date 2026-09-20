import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

const RotatingBanner = () => {
  // Initialize banners directly from cache for instant display
  const [banners, setBanners] = useState<Banner[]>(() => {
    try {
      const cached = localStorage.getItem('offline_banners');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
    return [];
  });
  const [currentBanner, setCurrentBanner] = useState(() => {
    try {
      // Check if this is a fresh app launch or navigation within session
      const sessionActive = sessionStorage.getItem('session_active');
      if (!sessionActive) {
        // Fresh app launch - start from beginning
        sessionStorage.setItem('session_active', 'true');
        sessionStorage.removeItem('banner_position');
        return 0;
      }
      // Navigation within session - restore position
      const saved = sessionStorage.getItem('banner_position');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Save banner position to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('banner_position', currentBanner.toString());
    } catch {
      // Ignore storage errors
    }
  }, [currentBanner]);

  // Reset position if out of bounds after banners load
  useEffect(() => {
    if (banners.length > 0 && currentBanner >= banners.length) {
      setCurrentBanner(0);
    }
  }, [banners.length, currentBanner]);

  // Track visibility with IntersectionObserver - pause video when not visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Pause/play video based on visibility and document hidden state
  useEffect(() => {
    if (!videoRef.current) return;
    
    const currentMedia = banners[currentBanner];
    if (currentMedia?.media_type !== 'video') return;

    if (isVisible && !document.hidden) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isVisible, currentBanner, banners]);

  // Handle document visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current) return;
      const currentMedia = banners[currentBanner];
      if (currentMedia?.media_type !== 'video') return;

      if (document.hidden || !isVisible) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isVisible, currentBanner, banners]);

  // Save video position periodically for persistence across navigation
  useEffect(() => {
    const saveVideoPosition = () => {
      if (videoRef.current && banners[currentBanner]?.media_type === 'video') {
        try {
          sessionStorage.setItem('video_position', videoRef.current.currentTime.toString());
          sessionStorage.setItem('video_banner_index', currentBanner.toString());
        } catch {}
      }
    };

    const interval = setInterval(saveVideoPosition, 500);
    window.addEventListener('beforeunload', saveVideoPosition);
    
    return () => {
      saveVideoPosition();
      clearInterval(interval);
      window.removeEventListener('beforeunload', saveVideoPosition);
    };
  }, [currentBanner, banners]);

  // Restore video position when video loads
  const handleVideoLoaded = () => {
    try {
      const savedPosition = sessionStorage.getItem('video_position');
      const savedBannerIndex = sessionStorage.getItem('video_banner_index');
      
      if (savedPosition && savedBannerIndex === currentBanner.toString()) {
        const position = parseFloat(savedPosition);
        if (videoRef.current && position > 0 && position < (videoRef.current.duration - 0.5)) {
          videoRef.current.currentTime = position;
        }
        sessionStorage.removeItem('video_position');
        sessionStorage.removeItem('video_banner_index');
      }
    } catch {}
  };

  // Fetch fresh data in background
  useEffect(() => {
    const loadBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners_config')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) throw error;

        const freshBanners = (data ?? []) as Banner[];
        setBanners(freshBanners);
        localStorage.setItem('offline_banners', JSON.stringify(freshBanners));

        if (freshBanners.length === 0) {
          setCurrentBanner(0);
          try {
            sessionStorage.removeItem('banner_position');
          } catch {}
        }
      } catch (e) {
        // Use cached data if available
      } finally {
        setIsLoading(false);
      }
    };

    loadBanners();
  }, []);

  // Auto-rotate for images only - videos use onEnded event
  useEffect(() => {
    if (banners.length === 0) return;
    
    const currentMedia = banners[currentBanner];
    if (!currentMedia) return;
    const isVideo = currentMedia?.media_type === 'video';
    
    // For videos, don't use interval - let onEnded handle rotation
    if (isVideo) return;
    
    // For images: use rotation_interval if set, otherwise default 4s
    const rotationTime = currentMedia.rotation_interval 
      ? currentMedia.rotation_interval * 1000 
      : 4000;
    
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, rotationTime);

    return () => clearInterval(interval);
  }, [banners.length, currentBanner, banners]);

  // Handle video end - move to next banner
  const handleVideoEnded = () => {
    setCurrentBanner((prev) => (prev + 1) % banners.length);
  };

  // Show skeleton while loading
  if (banners.length === 0) {
    if (isLoading) {
      return (
        <div className="w-full space-y-2">
          <div 
            className="w-full rounded-xl overflow-hidden bg-muted animate-pulse" 
            style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}
          />
          <div className="flex justify-center space-x-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-6 h-1.5 rounded-full bg-muted-foreground/20" />
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  const currentMedia = banners[currentBanner];
  if (!currentMedia) return null;
  const isVideo = currentMedia.media_type === 'video';

  return (
    <div ref={containerRef} className="w-full space-y-2">
      <div className="w-full rounded-xl overflow-hidden shadow-elegant relative" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}>
        {isVideo ? (
          <video
            ref={videoRef}
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            className="w-full h-full object-cover animate-fade-in"
            autoPlay
            playsInline
            preload="auto"
            onEnded={handleVideoEnded}
            onLoadedMetadata={handleVideoLoaded}
            aria-label={currentMedia.alt_text || 'Promotional video'}
          />
        ) : (
          <img
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            alt={currentMedia.alt_text || 'Promotional banner'}
            className="w-full h-full object-cover animate-fade-in"
            width={1200}
            height={400}
            sizes="(max-width: 768px) 100vw, 1200px"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
      </div>

      {/* Navigation bars */}
      <div className="flex justify-center space-x-1.5">
        {banners.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all duration-500 ease-in-out ${
              index === currentBanner 
                ? 'w-8 bg-primary' 
                : 'w-4 bg-muted-foreground/30'
            }`}
            aria-label={`Banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default RotatingBanner;
