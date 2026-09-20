import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Validate Somali phone format: 9 digits starting with 61, 77, or 68
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|68)\d{7}$/.test(phone);
};

// Check if user has completed offline registration
const hasOfflineRegistration = (): boolean => {
  const sender = localStorage.getItem('offlineSenderPhone');
  const receiver = localStorage.getItem('offlineReceiverPhone');
  return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if user has verified phone
  const verifiedPhone = localStorage.getItem('verifiedPhone');
  const hasAccess = isValidSomaliPhone(verifiedPhone);
  const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
  const hasOffline = hasOfflineRegistration() || hasSkipped;

  useEffect(() => {
    if (!hasAccess) {
      // Clear invalid data and redirect
      localStorage.removeItem('verifiedPhone');
      localStorage.removeItem('isGuestUser');
      navigate('/', { replace: true });
    } else if (!hasOffline && location.pathname !== '/offline-mode') {
      // User verified but hasn't completed offline registration
      // Force redirect to offline-mode
      navigate('/offline-mode', { replace: true });
    }
  }, [navigate, hasAccess, hasOffline, location.pathname]);

  // Only render children if verified
  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
