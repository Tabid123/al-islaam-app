import { useNavigate, useLocation } from 'react-router-dom';
import { Home, History, Bell, User } from 'lucide-react';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
}

export function BottomNavigation({}: BottomNavigationProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  useVisualViewport();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { icon: Home, label: 'Hoyga', path: '/providers', onClick: () => navigate('/providers') },
    { icon: History, label: 'Dalabyada', path: '/history', onClick: () => navigate('/history') },
    { icon: Bell, label: 'Ogeysiis', path: '/notifications', onClick: () => navigate('/notifications') },
    { icon: User, label: 'Profile', path: '/profile', onClick: () => navigate('/profile') },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transform-gpu"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        contain: 'layout'
      }}
    >
      <div className="bg-white border-t border-border/60 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex justify-around items-center pt-2 pb-1.5 px-2">
          {navItems.map(({ icon: Icon, label, path, onClick }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={onClick}
                className="relative flex flex-col items-center justify-center gap-1 px-3 py-1 min-w-[64px]"
              >
                <Icon
                  className="w-6 h-6 transition-colors"
                  style={{ color: active ? 'hsl(var(--primary))' : '#9CA3AF' }}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span
                  className="text-[11px] font-semibold tracking-tight"
                  style={{ color: active ? 'hsl(var(--primary))' : '#9CA3AF' }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
