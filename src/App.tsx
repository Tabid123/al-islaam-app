import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StatusBarColor } from "@/components/StatusBarColor";
import { ConnectivityProvider } from "@/contexts/ConnectivityContext";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useGlobalImagePreloader } from "@/hooks/useGlobalImagePreloader";
import { useEdgeToEdge } from "@/hooks/useEdgeToEdge";
import { useKeyboardInsets } from "@/hooks/useKeyboardInsets";
import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { useAutoOnlineRedirect } from "@/hooks/useAutoOnlineRedirect";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import ProviderSelection from "./pages/ProviderSelection";
import CategorySelection from "./pages/CategorySelection";
import DataPackages from "./pages/DataPackages";
import DiscoverPackages from "./pages/DiscoverPackages";
import PaymentProviders from "./pages/PaymentProviders";
import OfflineMode from "./pages/OfflineMode";
import PaymentSuccess from "./pages/PaymentSuccess";
import OrderHistory from "./pages/OrderHistory";
import Profile from "./pages/Profile";
import AiChat from "./pages/AiChat";
import Notifications from "./pages/Notifications";
import ScheduledOrders from "./pages/ScheduledOrders";
import Referral from "./pages/Referral";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import SimpleAdminDashboard from "./pages/SimpleAdminDashboard";
import SimpleAdminDetail from "./pages/SimpleAdminDetail";

import PrivacyPolicy from "./pages/PrivacyPolicy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds - user sees fresh data quickly
      gcTime: 24 * 60 * 60 * 1000, // 24 hours
      retry: 1,
      refetchOnWindowFocus: true, // Refresh when user returns to app
    },
  },
});

const AppContent = () => {
  useOfflineCache();
  useGlobalImagePreloader();
  useEdgeToEdge();
  useKeyboardInsets(); // Fix Android 15+ keyboard navigation bar issue
  useAutoOnlineRedirect(); // Auto-redirect to online mode when connectivity is restored
  const { showExitDialog, handleExitApp, handleCancelExit } = useAndroidBackButton();
  
  // Remove anti-flash style AFTER React has fully rendered
  useEffect(() => {
    // Wait for next frame to ensure DOM is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('anti-flash')?.remove();
      });
    });
  }, []);
  
  return (
    <>
      <StatusBarColor />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/providers" element={<ProtectedRoute><ProviderSelection /></ProtectedRoute>} />
        <Route path="/offline-mode" element={<ProtectedRoute><OfflineMode /></ProtectedRoute>} />
        <Route path="/categories/:provider" element={<ProtectedRoute><CategorySelection /></ProtectedRoute>} />
        <Route path="/packages/:provider" element={<ProtectedRoute><DataPackages /></ProtectedRoute>} />
        <Route path="/discover/:provider" element={<ProtectedRoute><DiscoverPackages /></ProtectedRoute>} />
        <Route path="/payment/:provider" element={<ProtectedRoute><PaymentProviders /></ProtectedRoute>} />
        
        <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute><AiChat /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/scheduled-orders" element={<ProtectedRoute><ScheduledOrders /></ProtectedRoute>} />
        <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
         <Route path="/simple-admin" element={<SimpleAdminDashboard />} />
         <Route path="/simple-admin/:type" element={<SimpleAdminDetail />} />
        
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      
      {/* Exit App Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={handleCancelExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ka bax App-ka?</AlertDialogTitle>
            <AlertDialogDescription>
              Ma hubtaa inaad rabto inaad ka baxdo Al-islaam Data app-ka?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelExit}>Maya</AlertDialogCancel>
            <AlertDialogAction onClick={handleExitApp}>Haa, Ka bax</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppContent />
              </BrowserRouter>
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ConnectivityProvider>
    </QueryClientProvider>
  );
};

export default App;
