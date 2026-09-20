// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, LogOut, Edit, Power, Upload, X, Users, Package, CheckCircle, XCircle, Clock, Search, Copy, Phone, Save, Smartphone, Filter, CalendarIcon, Pencil, UserPlus, WifiOff } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';
import { SimDashboard } from '@/components/admin/SimDashboard';
import { AddSimDialog } from '@/components/admin/AddSimDialog';
import { DeviceCard, groupSimsByDevice } from '@/components/admin/DeviceCard';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { DeviceManagement, Device as AndroidDevice } from '@/components/admin/DeviceManagement';
import { AdminAIChat } from '@/components/admin/AdminAIChat';
import { CompanyFinances } from '@/components/admin/CompanyFinances';
import { ReversalAlertsHeader } from '@/components/admin/ReversalAlertsHeader';
import { Suspense } from 'react';

// Lazy-loaded admin tab components (only loaded when tab is active)
const AppSettings = React.lazy(() => import('@/components/admin/AppSettings'));
const AppReleasesManager = React.lazy(() => import('@/components/admin/AppReleasesManager'));
const OfflinePaymentSettings = React.lazy(() => import('@/components/admin/OfflinePaymentSettings'));
const UnmatchedPayments = React.lazy(() => import('@/components/admin/UnmatchedPayments'));
const PaymentSmsLog = React.lazy(() => import('@/components/admin/PaymentSmsLog').then(m => ({ default: m.PaymentSmsLog })));
const SendNotification = React.lazy(() => import('@/components/admin/SendNotification').then(m => ({ default: m.SendNotification })));
const OnlinePaymentsDashboard = React.lazy(() => import('@/components/admin/OnlinePaymentsDashboard').then(m => ({ default: m.OnlinePaymentsDashboard })));
const SMSOfflineOrdersDashboard = React.lazy(() => import('@/components/admin/SMSOfflineOrdersDashboard').then(m => ({ default: m.SMSOfflineOrdersDashboard })));
const CombinedPaymentAnalytics = React.lazy(() => import('@/components/admin/CombinedPaymentAnalytics'));
const TransactionsDashboard = React.lazy(() => import('@/components/admin/TransactionsDashboard').then(m => ({ default: m.TransactionsDashboard })));
const BalanceManagement = React.lazy(() => import('@/components/admin/BalanceManagement').then(m => ({ default: m.BalanceManagement })));
const PackageDeliveryRules = React.lazy(() => import('@/components/admin/PackageDeliveryRules').then(m => ({ default: m.PackageDeliveryRules })));
const DailyOrdersManager = React.lazy(() => import('@/components/admin/DailyOrdersManager').then(m => ({ default: m.DailyOrdersManager })));
const BlockedUsersManager = React.lazy(() => import('@/components/admin/BlockedUsersManager').then(m => ({ default: m.BlockedUsersManager })));
const BulkSmsManager = React.lazy(() => import('@/components/admin/BulkSmsManager').then(m => ({ default: m.BulkSmsManager })));
const AutoTopUpSettings = React.lazy(() => import('@/components/admin/AutoTopUpSettings').then(m => ({ default: m.AutoTopUpSettings })));
const AuditLogViewer = React.lazy(() => import('@/components/admin/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));
const AdminManagement = React.lazy(() => import('@/components/admin/AdminManagement').then(m => ({ default: m.AdminManagement })));
const FraudAlerts = React.lazy(() => import('@/components/admin/FraudAlerts').then(m => ({ default: m.FraudAlerts })));

const LazyTabFallback = () => (
  <div className="flex justify-center items-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn, formatPrice } from '@/lib/utils';
import { calculateRiyokaabProfit, isUssdFlowCode } from '@/lib/profit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
  promotional_text?: string;
  display_order: number;
  evoucher_rate?: number;
}

interface DataPackage {
  id: string;
  provider_id: string;
  package_name: string;
  data_amount: string;
  validity_days: string;
  cost_price: number;
  selling_price: number;
  secret_price?: number | null;
  secret_prices?: number[] | null;
  profit_margin: number;
  is_discovery_root?: boolean;
  is_ussd_only?: boolean;
  ussd_code?: string | null;
  is_active: boolean;
  category_id: string | null;
  connection_type_label: string;
}

interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  ussd_code_template: string | null;
  payment_number: string | null;
  prefix_code: string | null;
}

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  is_active: boolean;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id: string | null;
  category_image?: string | null;
}

interface FeaturedPackage {
  id: string;
  package_id: string;
  display_order: number;
  is_active: boolean;
}

interface Order {
  id: string;
  customer_phone: string;
  payment_number: string;
  receiver_phone: string;
  package_name: string;
  package_id: string;
  data_amount: string;
  selling_price: number;
  status: 'pending' | 'completed' | 'failed' | 'payment_confirmed';
  created_at: string;
  provider_id: string;
  payment_provider_id: string;
  delivery_status: string;
  delivered_at: string | null;
  delivery_notes: string | null;
}

interface DeliveryInstruction {
  id: string;
  provider_id: string;
  instruction_template: string;
  code_template: string | null;
  notes: string | null;
  category_id: string | null;
  sim_password: string | null;
  package_id: string | null;
}

interface DiscountCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  usage_limit: number | null;
  times_used: number;
  applicable_to: 'all' | 'provider' | 'package' | null;
  provider_id: string | null;
  package_id: string | null;
}

interface CustomerDiscount {
  id: string;
  customer_phone: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  is_active: boolean;
  applicable_to: 'all' | 'provider' | 'package' | null;
  provider_id: string | null;
  package_id: string | null;
  notes: string | null;
}

interface ProfitOverride {
  id: string;
  package_id: string;
  custom_profit_margin: number;
  notes: string | null;
}

interface ErrorMessage {
  id: string;
  error_code: string;
  error_type: string;
  title: string;
  message: string;
  icon_type: 'emoji' | 'image';
  icon_value: string;
  is_animated: boolean;
  is_active: boolean;
}

interface Device {
  id: string;
  device_id: string;
  device_name: string | null;
  sim1_number: string | null;
  sim2_number: string | null;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

interface VerifiedPhone {
  id: string;
  phone_number: string;
  verified_at: string;
  last_login_at: string;
  created_at: string;
}

interface OfflineRegistration {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  provider_id: string | null;
  provider_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Error Message Card Component
const ErrorMessageCard = ({ 
  msg, 
  onUpdate, 
  onImageUpload, 
  uploadingIcon, 
  language 
}: { 
  msg: ErrorMessage; 
  onUpdate: (updated: ErrorMessage) => void; 
  onImageUpload: (errorType: string, file: File, currentMsg: ErrorMessage) => void;
  uploadingIcon: string | null;
  language: string;
}) => {
  const [localMsg, setLocalMsg] = useState(msg);

  useEffect(() => {
    setLocalMsg(msg);
  }, [msg]);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {msg.error_type === 'insufficient_balance' && '💰 Haraaga kuma filna'}
            {msg.error_type === 'user_cancelled' && '❌ Waad diidday'}
            {msg.error_type === 'timeout' && '⏱️ Waqtigu dhammaaday'}
            {msg.error_type === 'general' && '⚠️ Khalad'}
          </h3>
          <Button size="sm" onClick={() => onUpdate(localMsg)}>
            <Save className="w-4 h-4 mr-2" />
            {language === 'so' ? 'Kaydi' : 'Save'}
          </Button>
        </div>

        {/* Title Input */}
        <div>
          <Label>{language === 'so' ? 'Cinwaan' : 'Title'}</Label>
          <Input
            value={localMsg.title}
            onChange={(e) => setLocalMsg({ ...localMsg, title: e.target.value })}
          />
        </div>

        {/* Message Textarea */}
        <div>
          <Label>{language === 'so' ? 'Fariinta' : 'Message'}</Label>
          <Textarea
            value={localMsg.message}
            onChange={(e) => setLocalMsg({ ...localMsg, message: e.target.value })}
            rows={3}
          />
        </div>

        {/* Icon Section */}
        <div>
          <Label>{language === 'so' ? 'Icon' : 'Icon'}</Label>
          <div className="flex items-center gap-4 mt-2">
            {/* Current Icon Display */}
            {localMsg.icon_type === 'emoji' ? (
              <div className="text-5xl">{localMsg.icon_value}</div>
            ) : (
              <img src={localMsg.icon_value} alt="Icon" className="w-20 h-20 object-contain" />
            )}
            
            {/* Icon Input and Controls */}
            <div className="flex-1 space-y-2">
              <Input
                placeholder={localMsg.icon_type === 'emoji' ? 'Gali emoji' : 'Image URL'}
                value={localMsg.icon_value}
                onChange={(e) => setLocalMsg({ ...localMsg, icon_value: e.target.value })}
              />
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocalMsg({ ...localMsg, icon_type: 'emoji' })}
                >
                  Emoji
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocalMsg({ ...localMsg, icon_type: 'image' })}
                >
                  Sawir
                </Button>
                <label htmlFor={`upload-${msg.error_type}`}>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    disabled={uploadingIcon === msg.error_type}
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingIcon === msg.error_type ? 'Soo gelaya...' : 'Soo geli'}
                    </span>
                  </Button>
                </label>
                <input
                  id={`upload-${msg.error_type}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImageUpload(msg.error_type, file, localMsg);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Animation Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Label>{language === 'so' ? 'Animation ku shaqee?' : 'Enable Animation?'}</Label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localMsg.is_animated}
              onChange={(e) => setLocalMsg({ ...localMsg, is_animated: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>
    </Card>
  );
};

// Error Messages Manager Component
const ErrorMessagesManager = () => {
  const { language } = useLanguage();
  const [errorMessages, setErrorMessages] = useState<ErrorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingIcon, setUploadingIcon] = useState<string | null>(null);

  useEffect(() => {
    loadErrorMessages();
  }, []);

  const loadErrorMessages = async () => {
    const { data, error } = await supabase
      .from('error_messages')
      .select('*')
      .order('error_code');
    
    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else if (data) {
      setErrorMessages(data as ErrorMessage[]);
    }
    setLoading(false);
  };

  const updateErrorMessage = async (updated: ErrorMessage) => {
    const { error } = await supabase
      .from('error_messages')
      .update({
        title: updated.title,
        message: updated.message,
        icon_type: updated.icon_type,
        icon_value: updated.icon_value,
        is_animated: updated.is_animated,
      })
      .eq('id', updated.id);
    
    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la cusboonaysiiyay' : 'Updated successfully',
      });
      loadErrorMessages();
    }
  };

  const handleImageUpload = async (errorType: string, file: File, currentMsg: ErrorMessage) => {
    try {
      setUploadingIcon(errorType);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${errorType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('error-icons')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('error-icons')
        .getPublicUrl(fileName);

      await updateErrorMessage({
        ...currentMsg,
        icon_type: 'image',
        icon_value: publicUrl,
      });
    } catch (error: any) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploadingIcon(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {errorMessages.map((msg) => (
        <ErrorMessageCard
          key={msg.id}
          msg={msg}
          onUpdate={updateErrorMessage}
          onImageUpload={handleImageUpload}
          uploadingIcon={uploadingIcon}
          language={language}
        />
      ))}
    </div>
  );
};

const LiveClock = ({ language }: { language: string }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatted = time.toLocaleString(language === 'so' ? 'so-SO' : 'en-US', {
    timeZone: 'Africa/Mogadishu',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const mobileFormatted = time.toLocaleTimeString(language === 'so' ? 'so-SO' : 'en-US', {
    timeZone: 'Africa/Mogadishu',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground font-mono md:gap-1.5 md:text-sm">
      <Clock className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
      <span className="md:hidden">{mobileFormatted}</span>
      <span className="hidden md:inline">{formatted}</span>
    </div>
  );
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [packages, setPackages] = useState<DataPackage[]>([]);
  const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredPackages, setFeaturedPackages] = useState<FeaturedPackage[]>([]);
  const [editingPackage, setEditingPackage] = useState<DataPackage | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isPending, startTransition] = useTransition();
  const handleTabChange = useCallback((tab: string) => {
    startTransition(() => setActiveTab(tab));
  }, []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [providerLogoFile, setProviderLogoFile] = useState<File | null>(null);
  const [providerLogoPreview, setProviderLogoPreview] = useState<string>('');
  const [paymentProviderLogoFile, setPaymentProviderLogoFile] = useState<File | null>(null);
  const [paymentProviderLogoPreview, setPaymentProviderLogoPreview] = useState<string>('');
  const [categoryImageFile, setCategoryImageFile] = useState<File | null>(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [loadingAllOrders, setLoadingAllOrders] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  
  // Advanced filters for admin
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("all");
  
  // totalUsers is now derived via useMemo below
  const [deliveryInstructions, setDeliveryInstructions] = useState<DeliveryInstruction[]>([]);
  const [newDeliveryInstruction, setNewDeliveryInstruction] = useState({
    provider_id: '',
    code_template: '',
    notes: '',
    category_id: '',
    sim_password: '',
    package_id: '',
  });
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);

  const [newProvider, setNewProvider] = useState({
    provider_name: '',
    provider_logo: '',
    promotional_text: 'Riyokaab Data ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!',
    display_order: 0,
  });

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showProviderEditDialog, setShowProviderEditDialog] = useState(false);

  const [newPackage, setNewPackage] = useState({
    provider_id: '',
    package_name: '',
    data_amount: '',
    validity_days: 30,
    cost_price: 0,
    selling_price: 0,
    category_id: '',
    connection_type_label: 'Mobile Internet',
    profit_margin: 15,
  });

  // Free-text input for Days; validated on submit
  const [validityDaysInput, setValidityDaysInput] = useState<string>('30');
  const [editValidityDaysInput, setEditValidityDaysInput] = useState<string>('');
  const [newSecretPrices, setNewSecretPrices] = useState<string>('');
  const [editSecretPrices, setEditSecretPrices] = useState<string>('');

  const [newPaymentProvider, setNewPaymentProvider] = useState({
    provider_name: '',
    provider_logo: '',
    commission_rate: 0,
    ussd_code_template: '',
    payment_number: '',
    prefix_code: '',
  });

  const [newBanner, setNewBanner] = useState({
    banner_image: '',
    alt_text: '',
    display_order: 1,
    media_type: 'image' as 'image' | 'video',
    video_duration: null as number | null,
    rotation_interval: null as number | null,
  });

  const [newCategory, setNewCategory] = useState({
    category_name: '',
    display_order: 1,
    provider_id: '',
    category_image: '',
  });
  const [selectedCategoryProvider, setSelectedCategoryProvider] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCategoryEditDialog, setShowCategoryEditDialog] = useState(false);

  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscount[]>([]);
  
  // Offline registrations state
  const [offlineRegistrations, setOfflineRegistrations] = useState<OfflineRegistration[]>([]);
  const [offlineRegFilter, setOfflineRegFilter] = useState<'all' | 'active' | 'inactive' | 'today'>('all');
  const [offlineRegSearch, setOfflineRegSearch] = useState('');
  
  // Add registration dialog state
  const [showAddRegDialog, setShowAddRegDialog] = useState(false);
  const [newRegSenderPhone, setNewRegSenderPhone] = useState('');
  const [newRegReceiverPhone, setNewRegReceiverPhone] = useState('');
  const [newRegProvider, setNewRegProvider] = useState('');
  const [isAddingReg, setIsAddingReg] = useState(false);
  
  // Edit registration dialog state
  const [showEditRegDialog, setShowEditRegDialog] = useState(false);
  const [editingReg, setEditingReg] = useState<OfflineRegistration | null>(null);
  const [editRegSenderPhone, setEditRegSenderPhone] = useState('');
  const [editRegReceiverPhone, setEditRegReceiverPhone] = useState('');
  const [editRegProvider, setEditRegProvider] = useState('');
  const [isEditingReg, setIsEditingReg] = useState(false);
  
  // Derived order states (live from orders state)
  const pendingOrders = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);
  const confirmedOrders = useMemo(() => orders.filter(o => o.status === 'payment_confirmed'), [orders]);
  const totalUsers = useMemo(() => new Set(orders.map(o => o.customer_phone)).size, [orders]);

  // Devices state
  const [devices, setDevices] = useState<Device[]>([]);
  
  // Verified phones (customers) state
  const [verifiedPhones, setVerifiedPhones] = useState<VerifiedPhone[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'all' | 'today' | 'active' | 'inactive' | 'purchasedToday'>('all');
  
  // SIM Dashboard state - shared from DeviceManagement
  const [androidDevices, setAndroidDevices] = useState<AndroidDevice[]>([]);
  const [selectedSim, setSelectedSim] = useState<AndroidDevice | null>(null);
  const [showAddSimDialog, setShowAddSimDialog] = useState(false);

  // Handle devices change from DeviceManagement (single source of truth)
  const handleDevicesChange = (devices: AndroidDevice[]) => {
    setAndroidDevices(devices);
    // Select first device if none selected
    if (devices.length > 0 && !selectedSim) {
      setSelectedSim(devices[0]);
    }
    // Update selectedSim if it exists in new devices
    if (selectedSim) {
      const updated = devices.find(d => d.id === selectedSim.id);
      if (updated && (updated.device_id !== selectedSim.device_id || updated.last_ping_at !== selectedSim.last_ping_at)) {
        setSelectedSim(updated);
      }
    }
  };

  // USSD Dialog state
  const [showUSSDDialog, setShowUSSDDialog] = useState(false);
  const [generatedUSSDCode, setGeneratedUSSDCode] = useState('');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  // Template code quick edit state
  const [editingTemplateCode, setEditingTemplateCode] = useState<{
    packageId: string;
    packageName: string;
    providerId: string;
    categoryId: string | null;
    currentCode: string;
    instructionId: string | null;
    templateSource: 'package' | 'category' | 'provider';
  } | null>(null);
  const [quickTemplateCode, setQuickTemplateCode] = useState('');

  // Edit Payment Provider state
  const [editingPaymentProvider, setEditingPaymentProvider] = useState<PaymentProvider | null>(null);
  const [editPaymentNumber, setEditPaymentNumber] = useState('');
  const [editPrefixCode, setEditPrefixCode] = useState('');
  const [editUssdTemplate, setEditUssdTemplate] = useState('');
  const [editCommissionRate, setEditCommissionRate] = useState('');
  
  // Analytics refresh trigger
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  // Real-time subscription for new pending orders removed - consolidated into orders-changes channel below

  // Note: Real-time subscription for android devices is handled by DeviceManagement component

  const checkAdminAccess = async () => {
    try {
      // TEMPORARY: Check emergency local session (Feb 22, 2026 kadib waa la saari doonaa)
      const emergencySession = localStorage.getItem('adminEmergencySession');
      const emergencyTime = localStorage.getItem('adminEmergencyTime');
      if (emergencySession === 'true' && emergencyTime) {
        const sessionAge = Date.now() - parseInt(emergencyTime);
        // Session valid-ka waa 24 saac
        if (sessionAge < 24 * 60 * 60 * 1000) {
          setIsAdmin(true);
          loadData();
          return;
        } else {
          // Session dhammaaday - tirtir
          localStorage.removeItem('adminEmergencySession');
          localStorage.removeItem('adminEmergencyTime');
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: language === 'so' ? 'Fadlan gal' : 'Please login',
          variant: 'destructive',
        });
        navigate('/admin/login');
        return;
      }

      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error || !roleData) {
        toast({
          title: language === 'so' ? 'Ma lihid fasax' : 'Access denied',
          description: language === 'so' ? 'Admin kaliya ayaa awooda leh' : 'Only admins can access this page',
          variant: 'destructive',
        });
        navigate('/admin/login');
        return;
      }

      setIsAdmin(true);
      loadData();
    } catch (error) {
      console.error('Error checking admin access:', error);
      // Haddii Supabase xiran yahay, emergency session check
      const emergencySession = localStorage.getItem('adminEmergencySession');
      if (emergencySession === 'true') {
        setIsAdmin(true);
        loadData();
      } else {
        navigate('/admin/login');
      }
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Delete old categories with null provider_id
      await supabase.from('package_categories').delete().is('provider_id', null);
      
      const [providersRes, packagesRes, paymentRes, bannersRes, categoriesRes, featuredRes, ordersRes, deliveryRes, customerDiscountsRes, devicesRes, verifiedPhonesRes, offlineRegRes] = await Promise.all([
        supabase.from('providers_config').select('*').order('provider_name'),
        supabase.from('data_packages_config').select('*').order('selling_price'),
        supabase.from('payment_providers_config').select('*').order('provider_name'),
        supabase.from('banners_config').select('*').order('display_order'),
        supabase.from('package_categories').select('*').order('display_order'),
        supabase.from('featured_packages').select('*').order('display_order'),
        supabase.from('orders').select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url').order('created_at', { ascending: false }),
        supabase.from('delivery_instructions').select('*'),
        supabase.from('customer_discounts').select('*').order('created_at', { ascending: false }),
        supabase.from('android_devices').select('*').order('created_at', { ascending: false }),
        supabase.from('verified_phones').select('*').order('created_at', { ascending: false }),
        supabase.from('offline_registrations').select('*').order('created_at', { ascending: false }),
      ]);

      if (providersRes.data) setProviders(providersRes.data);
      if (packagesRes.data) setPackages(packagesRes.data);
      if (paymentRes.data) setPaymentProviders(paymentRes.data);
      if (bannersRes.data) setBanners(bannersRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (featuredRes.data) setFeaturedPackages(featuredRes.data);
      if (deliveryRes.data) setDeliveryInstructions(deliveryRes.data);
      if (customerDiscountsRes.data) setCustomerDiscounts(customerDiscountsRes.data as CustomerDiscount[]);
      if (devicesRes && devicesRes.data) setDevices(devicesRes.data as unknown as Device[]);
      if (verifiedPhonesRes && verifiedPhonesRes.data) setVerifiedPhones(verifiedPhonesRes.data as VerifiedPhone[]);
      if (offlineRegRes && offlineRegRes.data) setOfflineRegistrations(offlineRegRes.data as OfflineRegistration[]);
      
      // Note: android_devices are now loaded by DeviceManagement component (single source of truth)
      
      // Recursive fetch all orders (bypass 1000-row Supabase limit)
      const initialOrders = ordersRes.data as Order[] || [];
      if (initialOrders.length >= 1000) {
        // Hit the limit, need recursive fetch
        const { fetchAllRows } = await import('@/utils/fetchAllRows');
        const allOrders = await fetchAllRows<Order>(() =>
          supabase.from('orders')
            .select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url')
            .order('created_at', { ascending: false })
        );
        setOrders(allOrders);
        setFilteredOrders(allOrders);
        setShowAllOrders(true);
      } else {
        setOrders(initialOrders);
        setFilteredOrders(initialOrders);
        if (initialOrders.length >= 500) {
          // Might have more, auto-load all
          const { fetchAllRows } = await import('@/utils/fetchAllRows');
          const allOrders = await fetchAllRows<Order>(() =>
            supabase.from('orders')
              .select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url')
              .order('created_at', { ascending: false })
          );
          setOrders(allOrders);
          setFilteredOrders(allOrders);
          setShowAllOrders(true);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Ma suurtagelin data-ka' : 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Real-time subscription for new orders
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('New order received:', payload);
          const newOrder = payload.new as Order;
          
          // Add to orders list and pending orders
          setOrders(prev => {
            if (prev.find(o => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
          
          // Trigger analytics refresh
          setAnalyticsRefresh(prev => prev + 1);
          
          // Show notification toast
          toast({
            title: '🔔 Dalab Cusub!',
            description: `${newOrder.customer_phone} - ${newOrder.package_name} - $${newOrder.selling_price}`,
            duration: 15000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          const updatedOrder = payload.new as Order;
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
          
          // pendingOrders and confirmedOrders are now derived via useMemo
          
          setAnalyticsRefresh(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, language]);

  const confirmPayment = async (orderId: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'payment_confirmed' })
      .eq('id', orderId);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Lacagta waa la xaqiijiyay' : 'Payment confirmed successfully',
      });
      // Update local state - pendingOrders/confirmedOrders auto-derive via useMemo
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'payment_confirmed' } : o));
    }
  };

  const sendUSSDCode = async (order: Order) => {
    // Find delivery instruction
    const orderPackage = packages.find(p => p.id === order.package_id);
    let instruction = deliveryInstructions.find(
      d => d.provider_id === order.provider_id && d.category_id === orderPackage?.category_id
    );
    
    // If no category-specific instruction found, use the default (category_id = null)
    if (!instruction) {
      instruction = deliveryInstructions.find(
        d => d.provider_id === order.provider_id && !d.category_id
      );
    }

    if (!instruction?.code_template) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Code template ma jirto' : 'No code template found',
        variant: 'destructive',
      });
      return;
    }

    // Convert price to USSD format: 4.5 becomes 4*5
    const priceForUSSD = order.selling_price.toString().replace('.', '*');

    // Generate USSD code with * instead of decimal point
    let ussdCode = instruction.code_template;
    ussdCode = ussdCode.replace(/{receiver_phone}/g, order.receiver_phone);
    ussdCode = ussdCode.replace(/{package_name}/g, order.package_name);
    ussdCode = ussdCode.replace(/{data_amount}/g, order.data_amount);
    ussdCode = ussdCode.replace(/{customer_phone}/g, order.customer_phone);
    ussdCode = ussdCode.replace(/{sim_password}/g, instruction.sim_password || '');
    ussdCode = ussdCode.replace(/{price}/g, priceForUSSD);

    // Show dialog instead of triggering tel: link
    setGeneratedUSSDCode(ussdCode);
    setCurrentOrder(order);
    setShowUSSDDialog(true);
  };

  const copyUSSDCode = () => {
    navigator.clipboard.writeText(generatedUSSDCode);
    toast({
      title: language === 'so' ? 'Guul' : 'Success',
      description: language === 'so' ? 'Code-ka waa la copy garay' : 'Code copied to clipboard',
    });
  };

  const completeOrderAfterUSSD = async () => {
    if (!currentOrder) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'completed',
        delivery_status: 'completed',
        delivered_at: new Date().toISOString()
      })
      .eq('id', currentOrder.id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Order-ka waa la dhamaystiray' : 'Order completed successfully',
      });
      setShowUSSDDialog(false);
      setGeneratedUSSDCode('');
      // Update local state instead of reloading all 12 tables
      const updatedOrder = { ...currentOrder, status: 'completed', delivery_status: 'completed', delivered_at: new Date().toISOString() };
      setOrders(prev => prev.map(o => o.id === currentOrder.id ? updatedOrder as Order : o));
      setCurrentOrder(null);
    }
  };

  // Filter orders based on all filter criteria
  useEffect(() => {
    let filtered = orders;

    // Basic status filter
    if (orderFilter !== 'all') {
      if (orderFilter === 'completed') {
        filtered = filtered.filter(o => o.status === 'completed' || o.delivery_status === 'delivered');
      } else if (orderFilter === 'failed') {
        filtered = filtered.filter(o => o.status === 'failed' || o.delivery_status === 'failed');
      } else {
        filtered = filtered.filter(o => o.status === orderFilter);
      }
    }

    // Search filter
    if (orderSearch) {
      filtered = filtered.filter(order =>
        order.customer_phone.includes(orderSearch) ||
        order.receiver_phone.includes(orderSearch) ||
        order.package_name.toLowerCase().includes(orderSearch.toLowerCase())
      );
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(order => new Date(order.created_at) >= dateFrom);
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(order => new Date(order.created_at) <= endOfDay);
    }

    // Provider filter
    if (providerFilter && providerFilter !== "all") {
      filtered = filtered.filter(order => order.provider_id === providerFilter);
    }

    // Delivery status filter
    if (deliveryStatusFilter && deliveryStatusFilter !== "all") {
      filtered = filtered.filter(order => order.delivery_status === deliveryStatusFilter);
    }

    setFilteredOrders(filtered);
  }, [orderFilter, orderSearch, orders, dateFrom, dateTo, providerFilter, deliveryStatusFilter]);

  const updateOrderStatus = async (orderId: string, status: 'failed') => {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status,
        delivery_status: 'failed'
      })
      .eq('id', orderId);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Dalabka waa la diidday' : 'Order marked as failed',
      });
      // Update local state - derived lists auto-update
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, delivery_status: 'failed' } : o));
    }
  };

  const loadAllOrders = async () => {
    setLoadingAllOrders(true);
    try {
      const PAGE_SIZE = 1000;
      let allData: Order[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error('Error loading orders batch:', error);
          break;
        }
        if (!data || data.length === 0) break;
        allData = [...allData, ...data as Order[]];
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (allData.length > 0) {
        setOrders(allData);
        setShowAllOrders(true);
      }
    } catch (err) {
      console.error('Error loading all orders:', err);
    } finally {
      setLoadingAllOrders(false);
    }
  };

  const addDeliveryInstruction = async () => {
    if (!newDeliveryInstruction.provider_id || !newDeliveryInstruction.code_template) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Buuxi xogta muhiimka ah' : 'Fill required fields',
        variant: 'destructive',
      });
      return;
    }

    const instructionData = {
      provider_id: newDeliveryInstruction.provider_id,
      instruction_template: '',
      code_template: newDeliveryInstruction.code_template || null,
      notes: newDeliveryInstruction.notes || null,
      category_id: newDeliveryInstruction.category_id || null,
      sim_password: newDeliveryInstruction.sim_password || null,
      package_id: newDeliveryInstruction.package_id || null,
    };

    let error;
    if (editingInstructionId) {
      // Update existing instruction
      const result = await supabase
        .from('delivery_instructions')
        .update(instructionData)
        .eq('id', editingInstructionId);
      error = result.error;
    } else {
      // Insert new instruction
      const result = await supabase.from('delivery_instructions').insert([instructionData]);
      error = result.error;
    }

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: editingInstructionId 
          ? (language === 'so' ? 'Code-ka waa la cusboonaysiiyay' : 'Delivery code updated successfully')
          : (language === 'so' ? 'Code-ka waa la daray' : 'Delivery code added successfully'),
      });
      cancelEditInstruction();
      const { data: freshInstructions } = await supabase.from('delivery_instructions').select('*');
      if (freshInstructions) setDeliveryInstructions(freshInstructions);
    }
  };

  const startEditInstruction = (instruction: DeliveryInstruction) => {
    setEditingInstructionId(instruction.id);
    setNewDeliveryInstruction({
      provider_id: instruction.provider_id,
      code_template: instruction.code_template || '',
      notes: instruction.notes || '',
      category_id: instruction.category_id || '',
      sim_password: instruction.sim_password || '',
      package_id: instruction.package_id || '',
    });
  };

  const cancelEditInstruction = () => {
    setEditingInstructionId(null);
    setNewDeliveryInstruction({
      provider_id: '',
      code_template: '',
      notes: '',
      category_id: '',
      sim_password: '',
      package_id: '',
    });
  };

  // Scroll position preservation helpers
  const scrollPositionRef = useRef<number>(0);
  
  const saveScrollPosition = () => {
    scrollPositionRef.current = window.scrollY;
  };
  
  const restoreScrollPosition = () => {
    setTimeout(() => {
      window.scrollTo(0, scrollPositionRef.current);
    }, 100);
  };

  // Quick template code save function
  const saveQuickTemplateCode = async () => {
    if (!editingTemplateCode || !quickTemplateCode.trim()) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali template code' : 'Enter template code',
        variant: 'destructive',
      });
      return;
    }

    const instructionData = {
      provider_id: editingTemplateCode.providerId,
      instruction_template: '',
      code_template: quickTemplateCode.trim(),
      notes: null,
      category_id: editingTemplateCode.categoryId || null,
      sim_password: null,
      package_id: editingTemplateCode.packageId,
    };

    let error;
    
    // Check if there's already a package-specific instruction
    const existingPackageInstruction = deliveryInstructions.find(
      d => d.provider_id === editingTemplateCode.providerId && d.package_id === editingTemplateCode.packageId
    );

    if (existingPackageInstruction) {
      // Update existing package-specific instruction
      const result = await supabase
        .from('delivery_instructions')
        .update({ code_template: quickTemplateCode.trim() })
        .eq('id', existingPackageInstruction.id);
      error = result.error;
    } else {
      // Create new package-specific instruction
      const result = await supabase.from('delivery_instructions').insert([instructionData]);
      error = result.error;
    }

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Template code waa la baddelay' : 'Template code updated',
      });
      setEditingTemplateCode(null);
      setQuickTemplateCode('');
      // Reload delivery instructions only
      const { data: freshInstructions } = await supabase.from('delivery_instructions').select('*');
      if (freshInstructions) setDeliveryInstructions(freshInstructions);
    }
  };

  const deleteDeliveryInstruction = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa?' : 'Are you sure?')) return;

    const { error } = await supabase.from('delivery_instructions').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la tirtiray' : 'Deleted successfully',
      });
      setDeliveryInstructions(prev => prev.filter(d => d.id !== id));
    }
  };

  const addProvider = async () => {
    if (!newProvider.provider_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali magaca shirkadda' : 'Enter provider name',
        variant: 'destructive',
      });
      return;
    }

    let logoUrl = newProvider.provider_logo;

    // If file is selected, upload it first
    if (providerLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = providerLogoFile.name.split('.').pop();
        const fileName = `provider_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('provider-logos')
          .upload(fileName, providerLogoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('provider-logos')
          .getPublicUrl(fileName);

        logoUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Logo-ga lama soo gelin karin' : 'Failed to upload logo',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const { data: insertedData, error } = await supabase.from('providers_config').insert([{
      provider_name: newProvider.provider_name,
      provider_logo: logoUrl,
      promotional_text: newProvider.promotional_text,
      display_order: newProvider.display_order,
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Shirkadda waa la daray' : 'Provider added successfully',
      });
      setNewProvider({ provider_name: '', provider_logo: '', promotional_text: 'Riyokaab Data ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!', display_order: 0 });
      setProviderLogoFile(null);
      setProviderLogoPreview('');
      if (insertedData) {
        setProviders(prev => {
          const nextProviders = [...prev, ...insertedData].sort((a, b) => a.display_order - b.display_order);
          localStorage.setItem('offline_providers', JSON.stringify(nextProviders));
          return nextProviders;
        });
      }
    }
  };

  const updateProvider = async () => {
    if (!editingProvider) return;

    let logoUrl = editingProvider.provider_logo;
    
    if (providerLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = providerLogoFile.name.split('.').pop();
        const fileName = `provider_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('provider-logos')
          .upload(fileName, providerLogoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('provider-logos')
          .getPublicUrl(fileName);

        logoUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Logo-ga lama soo gelin karin' : 'Failed to upload logo',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const { error } = await supabase
      .from('providers_config')
      .update({
        provider_name: editingProvider.provider_name,
        provider_logo: logoUrl,
        promotional_text: editingProvider.promotional_text,
        display_order: editingProvider.display_order,
      })
      .eq('id', editingProvider.id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Shirkadda waa la cusboonaysiiyay' : 'Provider updated successfully',
      });
      setShowProviderEditDialog(false);
      const updatedProvider = { ...editingProvider, provider_logo: logoUrl };
      setProviders(prev => {
        const nextProviders = prev
          .map(p => p.id === editingProvider.id ? updatedProvider : p)
          .sort((a, b) => a.display_order - b.display_order);
        localStorage.setItem('offline_providers', JSON.stringify(nextProviders));
        return nextProviders;
      });
      setEditingProvider(null);
      setProviderLogoFile(null);
      setProviderLogoPreview('');
    }
  };

  const handleProviderLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Fadlan dooro sawir' : 'Please select an image file',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Logo-gu waa inuu ka yar yahay 2MB' : 'Logo must be less than 2MB',
          variant: 'destructive',
        });
        return;
      }
      setProviderLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProviderLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Admin-only package prices copied from Iftin Internet.
  // A package can have multiple private matching prices; they are never shown in the customer catalog.
  const parseSecretPrices = (raw: string): number[] => {
    const values = (raw || '')
      .split(/[,;\s]+/)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0);
    return Array.from(new Set(values));
  };

  const secretPricesOf = (pkg: DataPackage): number[] => {
    const values = (pkg.secret_prices || [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0);
    if (values.length === 0 && pkg.secret_price != null && Number(pkg.secret_price) > 0) {
      return [Number(pkg.secret_price)];
    }
    return values;
  };

  const findPriceConflicts = (providerId: string, sellingPrice: number, secretPrices: number[], skipId?: string) => {
    const ownPrices = [sellingPrice, ...secretPrices].filter(value => Number.isFinite(value) && value > 0);
    const conflicts: { price: number; packageName: string }[] = [];

    ownPrices.filter((value, index) => ownPrices.indexOf(value) !== index)
      .forEach(price => conflicts.push({ price, packageName: language === 'so' ? 'isla xirmadan' : 'this package' }));

    packages
      .filter(pkg => pkg.provider_id === providerId && pkg.is_active && pkg.id !== skipId)
      .forEach(pkg => {
        const otherPrices = [Number(pkg.selling_price), ...secretPricesOf(pkg)];
        ownPrices.forEach(price => {
          if (otherPrices.includes(price)) conflicts.push({ price, packageName: pkg.package_name });
        });
      });

    return conflicts;
  };

  const confirmPriceConflicts = (providerId: string, sellingPrice: number, secretPrices: number[], skipId?: string) => {
    const conflicts = findPriceConflicts(providerId, sellingPrice, secretPrices, skipId);
    if (conflicts.length === 0) return true;
    const list = conflicts.map(item => `• ${item.price} → ${item.packageName}`).join('\n');
    return window.confirm(
      language === 'so'
        ? `⚠️ Isku dhac qiimo!\n\nQiimahan horey waa loo isticmaalay:\n${list}\n\nHaddii lacagtaan la soo diro nidaamku ma kala garan karo xirmada. Ma sii wadaa?`
        : `⚠️ Price conflict!\n\nThese prices are already used:\n${list}\n\nIf this amount is received the system cannot identify the intended package. Continue?`
    );
  };

  const getEffectiveDeliveryCode = (pkg: Pick<DataPackage, 'id' | 'provider_id' | 'category_id' | 'ussd_code'>): string => {
    const exact = deliveryInstructions.find(d => d.provider_id === pkg.provider_id && d.package_id === pkg.id);
    const byCategory = deliveryInstructions.find(d => d.provider_id === pkg.provider_id && d.category_id === pkg.category_id && !d.package_id);
    const byProvider = deliveryInstructions.find(d => d.provider_id === pkg.provider_id && !d.category_id && !d.package_id);
    return String(exact?.code_template || byCategory?.code_template || byProvider?.code_template || pkg.ussd_code || '').trim();
  };

  const packageUsesUssdFlow = (pkg: DataPackage): boolean =>
    pkg.is_discovery_root === true || isUssdFlowCode(getEffectiveDeliveryCode(pkg));

  const calculatePackageProfit = (pkg: DataPackage): number => {
    const rate = providers.find(provider => provider.id === pkg.provider_id)?.evoucher_rate || 0;
    return calculateRiyokaabProfit(pkg.selling_price || 0, pkg.cost_price || 0, rate, packageUsesUssdFlow(pkg));
  };

  const addPackage = async () => {
    if (!newPackage.provider_id || !newPackage.package_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Buuxi xogta oo dhan' : 'Fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    const secrets = parseSecretPrices(newSecretPrices);
    if (!confirmPriceConflicts(newPackage.provider_id, Number(newPackage.selling_price), secrets)) return;

    // Xisaabta automatic ah: selling_price + (selling_price × profit_margin%) = total_received
    // profit = total_received - cost_price
    const profitMargin = newPackage.profit_margin || 15; // Default 15%
    const commission = newPackage.selling_price * (profitMargin / 100);
    const totalReceived = newPackage.selling_price + commission;
    const actualProfit = totalReceived - newPackage.cost_price;

    const { profit_margin: _pm, ...packageData } = newPackage;
    const { data: insertedPkg, error } = await supabase.from('data_packages_config').insert([{
      provider_id: packageData.provider_id,
      package_name: packageData.package_name,
      data_amount: packageData.data_amount,
      validity_days: validityDaysInput,
      cost_price: packageData.cost_price,
      selling_price: packageData.selling_price,
      secret_prices: secrets,
      secret_price: secrets[0] ?? null,
      category_id: packageData.category_id || null,
      connection_type_label: packageData.connection_type_label || 'Mobile Internet',
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' 
          ? `Package waa la daray! Faa'iidada: $${actualProfit.toFixed(2)}` 
          : `Package added! Profit: $${actualProfit.toFixed(2)}`,
      });
      setNewSecretPrices('');
      setNewPackage({
        provider_id: '',
        package_name: '',
        data_amount: '',
        validity_days: 30,
        cost_price: 0,
        selling_price: 0,
        category_id: '',
        connection_type_label: 'Mobile Internet',
        profit_margin: 15,
      });
      setValidityDaysInput('30');
      if (insertedPkg) setPackages(prev => [...prev, ...insertedPkg]);
    }
  };

  const addPaymentProvider = async () => {
    if (!newPaymentProvider.provider_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali magaca payment provider-ka' : 'Enter payment provider name',
        variant: 'destructive',
      });
      return;
    }

    let logoUrl = newPaymentProvider.provider_logo;

    // If file is selected, upload it first
    if (paymentProviderLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = paymentProviderLogoFile.name.split('.').pop();
        const fileName = `payment_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('provider-logos')
          .upload(fileName, paymentProviderLogoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('provider-logos')
          .getPublicUrl(fileName);

        logoUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Logo-ga lama soo gelin karin' : 'Failed to upload logo',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const { data: insertedPP, error } = await supabase.from('payment_providers_config').insert([{
      provider_name: newPaymentProvider.provider_name,
      provider_logo: logoUrl,
      commission_rate: newPaymentProvider.commission_rate,
      ussd_code_template: newPaymentProvider.ussd_code_template,
      payment_number: newPaymentProvider.payment_number,
      prefix_code: newPaymentProvider.prefix_code,
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Payment provider waa la daray' : 'Payment provider added successfully',
      });
      setNewPaymentProvider({ 
        provider_name: '', 
        provider_logo: '', 
        commission_rate: 0,
        ussd_code_template: '',
        payment_number: '',
        prefix_code: '',
      });
      setPaymentProviderLogoFile(null);
      setPaymentProviderLogoPreview('');
      if (insertedPP) setPaymentProviders(prev => [...prev, ...insertedPP]);
    }
  };

  const handlePaymentProviderLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Fadlan dooro sawir' : 'Please select an image file',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Logo-gu waa inuu ka yar yahay 2MB' : 'Logo must be less than 2MB',
          variant: 'destructive',
        });
        return;
      }
      setPaymentProviderLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProviderLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const deletePaymentProvider = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto payment provider-kan?' : 'Are you sure you want to delete this payment provider?')) {
      return;
    }

    const { error } = await supabase.from('payment_providers_config').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Payment provider waa la tirtiray' : 'Payment provider deleted successfully',
      });
      setPaymentProviders(prev => prev.filter(p => p.id !== id));
    }
  };

  const updatePaymentProvider = async () => {
    if (!editingPaymentProvider) return;
    const { error } = await supabase
      .from('payment_providers_config')
      .update({
        payment_number: editPaymentNumber || null,
        prefix_code: editPrefixCode || null,
        ussd_code_template: editUssdTemplate || null,
        commission_rate: parseFloat(editCommissionRate) || 0,
      })
      .eq('id', editingPaymentProvider.id);

    if (error) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Payment provider waa la cusbooneysiiyay' : 'Payment provider updated' });
      setPaymentProviders(prev => prev.map(p => p.id === editingPaymentProvider.id ? {
        ...p,
        payment_number: editPaymentNumber || null,
        prefix_code: editPrefixCode || null,
        ussd_code_template: editUssdTemplate || null,
        commission_rate: parseFloat(editCommissionRate) || 0,
      } : p));
      setEditingPaymentProvider(null);
    }
  };

  const toggleProviderStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('providers_config')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Status waa la beddelay' : 'Status updated',
      });
      setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    }
  };

  const deleteProvider = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto?' : 'Are you sure you want to delete?')) {
      return;
    }

    const { error } = await supabase.from('providers_config').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la tirtiray' : 'Deleted successfully',
      });
      setProviders(prev => prev.filter(p => p.id !== id));
    }
  };

  const addBanner = async () => {
    let mediaUrl = newBanner.banner_image;
    let detectedMediaType = newBanner.media_type;
    let videoDuration = newBanner.video_duration;

    // If file is selected, upload it first
    if (selectedFile) {
      setUploadingImage(true);
      try {
        // Detect media type from file
        const isVideo = selectedFile.type.startsWith('video/');
        detectedMediaType = isVideo ? 'video' : 'image';

        // Validate video duration if it's a video
        if (isVideo) {
          const duration = await getVideoDuration(selectedFile);
          if (duration > 300) { // 5 minutes = 300 seconds
            toast({
              title: language === 'so' ? 'Khalad' : 'Error',
              description: language === 'so' ? 'Video-gu waa in uu ka yar yahay 5 daqiiqo' : 'Video must be less than 5 minutes',
              variant: 'destructive',
            });
            setUploadingImage(false);
            return;
          }
          videoDuration = Math.floor(duration);
        }

        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('banners')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('banners')
          .getPublicUrl(filePath);

        mediaUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'File-ka lama soo gelin karin' : 'Failed to upload file',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    if (!mediaUrl) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali URL ama dooro file' : 'Enter URL or select a file',
        variant: 'destructive',
      });
      return;
    }

    const { data: insertedBanner, error } = await supabase.from('banners_config').insert([{
      banner_image: mediaUrl,
      alt_text: newBanner.alt_text,
      display_order: newBanner.display_order,
      media_type: detectedMediaType,
      video_duration: videoDuration,
      rotation_interval: newBanner.rotation_interval,
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Banner waa la daray' : 'Banner added successfully',
      });
      setNewBanner({ banner_image: '', alt_text: '', display_order: 1, media_type: 'image', video_duration: null, rotation_interval: null });
      setSelectedFile(null);
      setPreviewUrl('');
      if (insertedBanner) setBanners(prev => [...prev, ...insertedBanner]);
    }
  };

  const processFile = async (file: File) => {
    // Validate file type (both images and videos)
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan dooro sawir ama video' : 'Please select an image or video file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'File-ku waa inuu ka yar yahay 10MB' : 'File must be less than 10MB',
        variant: 'destructive',
      });
      return;
    }

    // No dimension validation - accept any size and let CSS handle fitting

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl('');
  };

  const handleCategoryImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Fadlan dooro sawir' : 'Please select an image file',
          variant: 'destructive',
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Sawirku waa inuu ka yar yahay 5MB' : 'Image must be less than 5MB',
          variant: 'destructive',
        });
        return;
      }

      setCategoryImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCategoryImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearCategoryImageFile = () => {
    setCategoryImageFile(null);
    setCategoryImagePreview('');
  };

  // Helper function to get video duration
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = URL.createObjectURL(file);
    });
  };

  const toggleBannerStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('banners_config')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setBanners(prev => prev.map(b => b.id === id ? { ...b, is_active: !currentStatus } : b));
    }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto?' : 'Are you sure you want to delete?')) {
      return;
    }

    const { error } = await supabase.from('banners_config').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la tirtiray' : 'Deleted successfully',
      });
      setBanners(prev => prev.filter(b => b.id !== id));
    }
  };

  const addCategory = async () => {
    if (!newCategory.category_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali magaca category-ga' : 'Enter category name',
        variant: 'destructive',
      });
      return;
    }

    if (!newCategory.provider_id) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Dooro shirkadda' : 'Select a provider',
        variant: 'destructive',
      });
      return;
    }

    let imageUrl = newCategory.category_image;

    // If file is selected, upload it first
    if (categoryImageFile) {
      setUploadingImage(true);
      try {
        const fileExt = categoryImageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('provider-logos')
          .upload(filePath, categoryImageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('provider-logos')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Sawirka lama soo gelin karin' : 'Failed to upload image',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const { data: insertedCat, error } = await supabase.from('package_categories').insert([{
      category_name: newCategory.category_name,
      display_order: newCategory.display_order,
      provider_id: newCategory.provider_id,
      category_image: imageUrl || null
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Category waa la daray' : 'Category added successfully',
      });
      setNewCategory({ category_name: '', display_order: 1, provider_id: '', category_image: '' });
      clearCategoryImageFile();
      if (insertedCat) setCategories(prev => [...prev, ...insertedCat]);
    }
  };

  const toggleCategoryStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('package_categories')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto?' : 'Are you sure you want to delete?')) {
      return;
    }

    const { error } = await supabase.from('package_categories').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la tirtiray' : 'Deleted successfully',
      });
      setCategories(prev => prev.filter(c => c.id !== id));
    }
  };

  const updateCategory = async () => {
    if (!editingCategory) return;

    if (!editingCategory.category_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Gali magaca category-ga' : 'Enter category name',
        variant: 'destructive',
      });
      return;
    }

    if (!editingCategory.provider_id) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Dooro shirkadda' : 'Select a provider',
        variant: 'destructive',
      });
      return;
    }

    let imageUrl = editingCategory.category_image;

    // If file is selected, upload it first
    if (categoryImageFile) {
      setUploadingImage(true);
      try {
        const fileExt = categoryImageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('provider-logos')
          .upload(filePath, categoryImageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('provider-logos')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      } catch (error: any) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: language === 'so' ? 'Sawirka lama soo gelin karin' : 'Failed to upload image',
          variant: 'destructive',
        });
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const { error } = await supabase
      .from('package_categories')
      .update({
        category_name: editingCategory.category_name,
        display_order: editingCategory.display_order,
        provider_id: editingCategory.provider_id,
        category_image: imageUrl || null
      })
      .eq('id', editingCategory.id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Category waa la cusboonaysiiyay' : 'Category updated successfully',
      });
      setShowCategoryEditDialog(false);
      setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...editingCategory, category_image: imageUrl || null } : c));
      setEditingCategory(null);
      clearCategoryImageFile();
    }
  };

  // Pricing Management Functions
  const updatePackagePricing = async (packageId: string, costPrice: number, sellingPrice: number) => {
    saveScrollPosition();
    
    const profitMargin = ((sellingPrice - costPrice) / costPrice * 100).toFixed(2);
    
    const { error } = await supabase
      .from('data_packages_config')
      .update({ 
        cost_price: costPrice, 
        selling_price: sellingPrice,
        profit_margin: parseFloat(profitMargin)
      })
      .eq('id', packageId);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Cilad ayaa dhacday pricing-ka markii la cusboonaynaayey' : 'Failed to update pricing',
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Pricing waa la cusboonaysiiyey!' : 'Pricing updated successfully!',
      });
      setPackages(prev => prev.map(p => p.id === packageId ? { ...p, cost_price: costPrice, selling_price: sellingPrice, profit_margin: parseFloat(profitMargin) } : p));
      restoreScrollPosition();
    }
  };

  const addCustomerDiscount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const customerPhone = formData.get('customer_phone') as string;
    const discountType = formData.get('discount_type') as 'percentage' | 'fixed';
    const discountValue = parseFloat(formData.get('discount_value') as string);
    const applicableTo = formData.get('applicable_to') as 'all' | 'provider' | 'package';
    const notes = formData.get('notes') as string;

    if (!customerPhone || !discountValue) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Buuxi macluumaadka oo dhan' : 'Fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    const { data: insertedDiscount, error } = await supabase.from('customer_discounts').insert([{
      customer_phone: customerPhone,
      discount_type: discountType,
      discount_value: discountValue,
      applicable_to: applicableTo,
      provider_id: null,
      package_id: null,
      notes: notes || null,
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Qiimo dhimis waa la daray' : 'Discount added successfully',
      });
      e.currentTarget.reset();
      if (insertedDiscount) setCustomerDiscounts(prev => [...insertedDiscount as CustomerDiscount[], ...prev]);
    }
  };

  const deleteCustomerDiscount = async (id: string) => {
    const { error } = await supabase.from('customer_discounts').delete().eq('id', id);
    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setCustomerDiscounts(prev => prev.filter(d => d.id !== id));
    }
  };

  const addFeaturedPackage = async (packageId: string) => {
    // Check if already exists
    const exists = featuredPackages.find(fp => fp.package_id === packageId);
    if (exists) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Xirmada horay ayuu ugu jirta' : 'Package already featured',
        variant: 'destructive',
      });
      return;
    }

    const { data: insertedFP, error } = await supabase.from('featured_packages').insert([{
      package_id: packageId,
      display_order: featuredPackages.length + 1,
      is_active: true
    }]).select();

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la daray' : 'Added successfully',
      });
      if (insertedFP) setFeaturedPackages(prev => [...prev, ...insertedFP]);
    }
  };

  const removeFeaturedPackage = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad ka saarto?' : 'Are you sure you want to remove?')) {
      return;
    }

    const { error } = await supabase.from('featured_packages').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Waa la saaray' : 'Removed successfully',
      });
      setFeaturedPackages(prev => prev.filter(fp => fp.id !== id));
    }
  };

  const togglePackageStatus = async (id: string, currentStatus: boolean) => {
    saveScrollPosition();
    
    const { error } = await supabase
      .from('data_packages_config')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Status waa la beddelay' : 'Status updated',
      });
      setPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
      restoreScrollPosition();
    }
  };

  const deletePackage = async (id: string) => {
    if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto package-kan?' : 'Are you sure you want to delete this package?')) {
      return;
    }

    const { error } = await supabase.from('data_packages_config').delete().eq('id', id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Package waa la tirtiray' : 'Package deleted successfully',
      });
      setPackages(prev => prev.filter(p => p.id !== id));
    }
  };

  const updatePackage = async () => {
    if (!editingPackage) return;

    const secrets = parseSecretPrices(editSecretPrices);
    if (!confirmPriceConflicts(editingPackage.provider_id, Number(editingPackage.selling_price), secrets, editingPackage.id)) return;

    const profitMargin = editingPackage.cost_price > 0
      ? ((editingPackage.selling_price - editingPackage.cost_price) / editingPackage.cost_price) * 100
      : 0;

    const { error } = await supabase
      .from('data_packages_config')
      .update({
        package_name: editingPackage.package_name,
        data_amount: editingPackage.data_amount,
        validity_days: editValidityDaysInput,
        cost_price: editingPackage.cost_price,
        selling_price: editingPackage.selling_price,
        secret_prices: secrets,
        secret_price: secrets[0] ?? null,
        profit_margin: profitMargin,
        category_id: editingPackage.category_id,
        connection_type_label: editingPackage.connection_type_label,
      })
      .eq('id', editingPackage.id);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Package waa la beddelay' : 'Package updated successfully',
      });
      const updatedPkg = { ...editingPackage, validity_days: editValidityDaysInput, profit_margin: profitMargin, secret_prices: secrets, secret_price: secrets[0] ?? null };
      setPackages(prev => prev.map(p => p.id === editingPackage.id ? updatedPkg : p));
      setEditingPackage(null);
      restoreScrollPosition();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const shouldRenderDeviceManagement = activeTab === 'devices' || (!isMobile && activeTab === 'dashboard');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full max-w-[100vw] overflow-x-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <AdminSidebar activeTab={activeTab} onTabChange={handleTabChange} />
        
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-auto min-h-[48px] border-b bg-background/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-4">
            <div className="flex w-full items-center gap-2 md:gap-4">
              <SidebarTrigger />
              <div className="flex min-w-0 flex-1 flex-col items-center md:flex-row md:items-center md:gap-3">
                <h1 className="w-full min-w-0 truncate text-center text-base font-bold md:w-auto md:text-left md:text-xl">
                  {language === 'so' ? 'Admin' : 'Admin'}
                </h1>
                <LiveClock language={language} />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <ReversalAlertsHeader iconClassName="h-5 w-5" buttonClassName="text-foreground" />
                <LanguageSelector />
                <ThemeToggle />
                <Button onClick={handleLogout} variant="outline" size="sm" className="h-8 px-2 md:px-3">
                  <LogOut className="h-4 w-4" />
                  <span className="ml-1 hidden md:inline">{language === 'so' ? 'Ka bax' : 'Logout'}</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-2 md:p-6 overflow-x-hidden overflow-y-auto max-w-[100vw]">
            <div className="max-w-full overflow-x-hidden">
              
              <Tabs value={activeTab} onValueChange={handleTabChange} defaultValue="dashboard" className="space-y-3 md:space-y-6">
                <Suspense fallback={<LazyTabFallback />}>

          {/* Transactions Dashboard Tab */}
          <TabsContent value="transactions-dashboard" className="space-y-6">
            <TransactionsDashboard />
          </TabsContent>

          {/* Send Notification Tab */}
          <TabsContent value="send-notification" className="space-y-6">
            <SendNotification />
          </TabsContent>

          {/* Online Payments Tab - WaafiPay API Orders Only */}
          <TabsContent value="online-payments" className="space-y-6">
            <OnlinePaymentsDashboard />
          </TabsContent>

          {/* SMS Offline Orders Tab */}
          <TabsContent value="sms-offline-orders" className="space-y-6">
            <SMSOfflineOrdersDashboard />
          </TabsContent>

          {/* Combined Analytics Tab */}
          <TabsContent value="combined-analytics" className="space-y-6">
            <CombinedPaymentAnalytics />
          </TabsContent>

          {/* Dashboard Tab - Device Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Analytics Overview at the top */}
            <AnalyticsDashboard refreshTrigger={analyticsRefresh} />
            
            {/* Devices Section */}
            {<div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {language === 'so' ? '📱 Devices & SIM-yada' : '📱 Devices & SIMs'}
                </h2>
                <Button onClick={() => setShowAddSimDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === 'so' ? 'Device Cusub' : 'Add Device'}
                </Button>
              </div>

              {/* Device Cards Grid */}
              {groupSimsByDevice(androidDevices).length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {groupSimsByDevice(androidDevices).map((device) => (
                    <DeviceCard 
                      key={device.device_id} 
                      device={device} 
                      onUpdate={() => {}} 
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center mb-4">
                      {language === 'so' 
                        ? 'Device kuma jiro. Ku dar mid cusub!'
                        : 'No devices yet. Add a new one!'}
                    </p>
                    <Button onClick={() => setShowAddSimDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      {language === 'so' ? 'Device Cusub' : 'Add Device'}
                    </Button>
                  </CardContent>
                </Card>
              )}
              
              {/* Add SIM Dialog */}
              <AddSimDialog
                open={showAddSimDialog}
                onOpenChange={setShowAddSimDialog}
                onSuccess={() => {}}
              />
            </div>}
          </TabsContent>

          {/* Notifications Tab - Order Alerts with Accept/Reject */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>🔔 {language === 'so' ? 'Dalabyo Cusub' : 'New Orders'}</CardTitle>
                <CardDescription>
                  {language === 'so' ? 'Aqbali ama diidi dalabka cusub' : 'Accept or reject new orders'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Pending Orders Section */}
                {pendingOrders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase">
                      {language === 'so' ? 'Dalabyo Sugaya' : 'Pending Orders'} ({pendingOrders.length})
                    </h3>
                    <div className="space-y-3">
                      {pendingOrders.map((order) => (
                        <div key={order.id} className="bg-card rounded-lg p-4 border shadow-sm border-l-4 border-l-yellow-500">
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">📱 Customer:</span>
                              <span className="font-medium">{order.customer_phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">📦 Package:</span>
                              <span className="font-medium">{order.package_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">👤 Receiver:</span>
                              <span className="font-medium">{order.receiver_phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">💰 Price:</span>
                              <span className="font-medium">${order.selling_price.toFixed(2)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              🕐 {new Date(order.created_at).toLocaleString()}
                            </div>
                            
                            {/* Question about money */}
                            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-3">
                                Lambarkan {order.customer_phone} maka heysaa lacag dhan ${order.selling_price.toFixed(2)}?
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from('orders')
                                      .update({ status: 'payment_confirmed' })
                                      .eq('id', order.id);
                                    
                                    if (error) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to confirm payment",
                                        variant: "destructive"
                                      });
                                    } else {
                                      toast({
                                        title: language === 'so' ? 'Waa la aqbalay' : 'Confirmed',
                                        description: language === 'so' ? 'Lacagta waa la xaqiijiyey' : 'Payment confirmed'
                                      });
                                      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'payment_confirmed' as const } : o));
                                    }
                                  }}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                >
                                  ✅ HAA
                                </Button>
                                <Button
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from('orders')
                                      .update({ status: 'failed' })
                                      .eq('id', order.id);
                                    
                                    if (error) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to reject order",
                                        variant: "destructive"
                                      });
                                    } else {
                                      toast({
                                        title: language === 'so' ? 'Waa la diiday' : 'Rejected',
                                        description: language === 'so' ? 'Dalabka waa la diiday' : 'Order rejected'
                                      });
                                      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'failed' as const } : o));
                                    }
                                  }}
                                  variant="destructive"
                                  className="flex-1"
                                >
                                  ❌ MAYA
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirmed Orders Section */}
                {confirmedOrders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase">
                      {language === 'so' ? 'Dalabyo La Aqbalay' : 'Confirmed Orders'} ({confirmedOrders.length})
                    </h3>
                    <div className="space-y-3">
                      {confirmedOrders.map((order) => (
                        <div key={order.id} className="bg-card rounded-lg p-4 border shadow-sm border-l-4 border-l-green-500">
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">📱 Customer:</span>
                              <span className="font-medium">{order.customer_phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">📦 Package:</span>
                              <span className="font-medium">{order.package_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">👤 Receiver:</span>
                              <span className="font-medium">{order.receiver_phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">💰 Price:</span>
                              <span className="font-medium">${order.selling_price.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                              ✅ {language === 'so' ? 'La Aqbalay' : 'Confirmed'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={async () => {
                                const instruction = deliveryInstructions.find(
                                  d => d.provider_id === order.provider_id
                                );
                                
                                if (!instruction?.code_template) {
                                  toast({
                                    title: "Error",
                                    description: "No delivery code template found for this provider",
                                    variant: "destructive"
                                  });
                                  return;
                                }
                                
                                const priceForUSSD = order.selling_price.toString().replace('.', '*');
                                let ussdCode = instruction.code_template;
                                
                                // Replace placeholders in the template
                                ussdCode = ussdCode
                                  .replace('{phone}', order.receiver_phone)
                                  .replace('{receiver_phone}', order.receiver_phone)
                                  .replace('{price}', priceForUSSD)
                                  .replace('{amount}', priceForUSSD)
                                  .replace('{password}', instruction.sim_password || '')
                                  .replace('{sim_password}', instruction.sim_password || '');
                                
                                // Ensure it starts with * and ends with #
                                if (!ussdCode.startsWith('*')) ussdCode = '*' + ussdCode;
                                if (!ussdCode.endsWith('#')) ussdCode = ussdCode + '#';
                                
                                window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
                                
                                const { error } = await supabase
                                  .from('orders')
                                  .update({ 
                                    status: 'completed',
                                    delivered_at: new Date().toISOString()
                                  })
                                  .eq('id', order.id);
                                
                                if (!error) {
                                  toast({
                                    title: language === 'so' ? 'Waa la dhameeyey' : 'Order Completed',
                                    description: language === 'so' ? 'Dalabka waa la dhameeyey' : 'Order has been marked as completed'
                                  });
                                  const completedOrder = { ...order, status: 'completed' as const, delivered_at: new Date().toISOString() };
                                  setOrders(prev => prev.map(o => o.id === order.id ? completedOrder : o));
                                }
                              }}
                              className="flex-1"
                              style={{ backgroundColor: '#0099ff' }}
                            >
                              📞 {language === 'so' ? 'Wac Dealer' : 'Call Dealer'}
                            </Button>
                            <Button
                              onClick={async () => {
                                const instruction = deliveryInstructions.find(
                                  d => d.provider_id === order.provider_id
                                );
                                
                                if (!instruction?.code_template) {
                                  toast({
                                    title: "Error",
                                    description: "No delivery code template found for this provider",
                                    variant: "destructive"
                                  });
                                  return;
                                }
                                
                                const priceForUSSD = order.selling_price.toString().replace('.', '*');
                                let ussdCode = instruction.code_template;
                                
                                // Replace placeholders in the template
                                ussdCode = ussdCode
                                  .replace('{phone}', order.receiver_phone)
                                  .replace('{receiver_phone}', order.receiver_phone)
                                  .replace('{price}', priceForUSSD)
                                  .replace('{amount}', priceForUSSD)
                                  .replace('{password}', instruction.sim_password || '')
                                  .replace('{sim_password}', instruction.sim_password || '');
                                
                                // Ensure it starts with * and ends with #
                                if (!ussdCode.startsWith('*')) ussdCode = '*' + ussdCode;
                                if (!ussdCode.endsWith('#')) ussdCode = ussdCode + '#';
                                
                                try {
                                  await navigator.clipboard.writeText(ussdCode);
                                  toast({
                                    title: language === 'so' ? 'Code la koobiyeeyey' : 'Code Copied',
                                    description: language === 'so' ? 'USSD code waa la koobiyeeyey' : 'USSD code copied to clipboard'
                                  });
                                  
                                  const { error } = await supabase
                                    .from('orders')
                                    .update({ 
                                      status: 'completed',
                                      delivered_at: new Date().toISOString()
                                    })
                                    .eq('id', order.id);
                                  
                                  if (!error) {
                                    const completedOrder2 = { ...order, status: 'completed' as const, delivered_at: new Date().toISOString() };
                                    setOrders(prev => prev.map(o => o.id === order.id ? completedOrder2 : o));
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Error",
                                    description: "Failed to copy USSD code",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              variant="outline"
                              className="flex-1"
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              {language === 'so' ? 'Koobiyee' : 'Copy Code'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {pendingOrders.length === 0 && confirmedOrders.length === 0 && (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">
                      {language === 'so' ? 'Wali dalab ma jiro' : 'No orders yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {language === 'so' ? 'Dalabyo cusub halkan ayay ka soo muuqan doonaan' : 'New orders will appear here in real-time'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          {/* Delivery Tab - Mobile Friendly USSD Code Delivery */}
          <TabsContent value="delivery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? '📦 Dir Xirmada' : '📦 Send Packages'}</CardTitle>
                <CardDescription>
                  {language === 'so' ? 'Orders diyaar ah in la diro (Payment Confirmed)' : 'Orders ready for delivery (Payment Confirmed)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'so' ? 'Raadi customer ama receiver...' : 'Search customer or receiver...'}
                    className="pl-10"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>

                {/* Pending Count */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'so' ? 'Sugaya in la diro' : 'Pending Delivery'}
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {orders.filter(o => o.status === 'payment_confirmed').length}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-primary" />
                  </div>
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                  {orders
                    .filter(o => o.status === 'payment_confirmed')
                    .filter(o => 
                      !orderSearch || 
                      o.customer_phone.includes(orderSearch) ||
                      o.receiver_phone.includes(orderSearch) ||
                      o.package_name.toLowerCase().includes(orderSearch.toLowerCase())
                    )
                    .map((order) => {
                      const provider = providers.find(p => p.id === order.provider_id);
                      const paymentProvider = paymentProviders.find(p => p.id === order.payment_provider_id);
                      
                      return (
                        <Card key={order.id} className="border-2 hover:border-primary/50 transition-colors">
                          <CardContent className="p-4 space-y-3">
                            {/* Order Info */}
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs">{language === 'so' ? 'Customer' : 'Customer'}</p>
                                <p className="font-semibold">📱 {order.customer_phone}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">{language === 'so' ? 'Receiver' : 'Receiver'}</p>
                                <p className="font-semibold">👤 {order.receiver_phone}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">{language === 'so' ? 'Package' : 'Package'}</p>
                                <p className="font-semibold">📦 {order.package_name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">{language === 'so' ? 'Qiimaha' : 'Price'}</p>
                                <p className="font-semibold">💰 ${order.selling_price}</p>
                              </div>
                            </div>

                            {/* Provider Info */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {provider?.provider_logo && (
                                <img src={provider.provider_logo} alt={provider.provider_name} className="h-4 w-4 object-contain" />
                              )}
                              <span>{provider?.provider_name}</span>
                              <span>•</span>
                              <span>{paymentProvider?.provider_name}</span>
                            </div>

                            {/* Action Button */}
                            <Button 
                              onClick={() => sendUSSDCode(order)} 
                              className="w-full"
                              size="lg"
                            >
                              {language === 'so' ? 'Dir USSD Code ➜' : 'Send USSD Code ➜'}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}

                  {orders.filter(o => o.status === 'payment_confirmed').length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{language === 'so' ? 'Ma jiraan orders diyaar ah' : 'No orders ready for delivery'}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Statistics Tab */}
          <TabsContent value="users" className="space-y-6">
            {(() => {
              const today = new Date();
              const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              // Helper function to normalize phone numbers for comparison
              const normalizePhone = (phone: string) => phone.replace(/^\+252/, '');
              
              // Today's new registrations
              const todayRegistrations = verifiedPhones.filter(phone => 
                new Date(phone.created_at) >= startOfToday
              ).length;
              
              // Customers who purchased today (only verified users)
              const todayBuyerPhones = new Set(
                orders
                  .filter(o => new Date(o.created_at) >= startOfToday)
                  .map(o => normalizePhone(o.customer_phone))
              );
              const activeTodayCount = verifiedPhones.filter(
                phone => todayBuyerPhones.has(normalizePhone(phone.phone_number))
              ).length;
              
              // Inactive customers (registered but never purchased)
              const allBuyers = new Set(orders.map(o => normalizePhone(o.customer_phone)));
              const inactiveCount = verifiedPhones.filter(
                phone => !allBuyers.has(normalizePhone(phone.phone_number))
              ).length;

              return (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card className="border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-primary">
                        {language === 'so' ? 'Wadarta Macaamiisha' : 'Total Users'}
                      </CardTitle>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary">{verifiedPhones.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Dadka app-ka isdiiwaangeliyay' : 'Registered users'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-emerald-600">
                        {language === 'so' ? 'Maanta Is-diiwaan' : 'Today Registered'}
                      </CardTitle>
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-emerald-500" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-emerald-600">{todayRegistrations}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Cusub maanta' : 'New today'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-sky-600">
                        {language === 'so' ? 'Maanta Iibsatay' : 'Purchased Today'}
                      </CardTitle>
                      <div className="h-8 w-8 rounded-full bg-sky-500/10 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-sky-500" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-sky-600">{activeTodayCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Macaamiil firfircoon' : 'Active customers'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-amber-600">
                        {language === 'so' ? 'Aan Wax Iibsan' : 'Never Purchased'}
                      </CardTitle>
                      <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-amber-500" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-amber-600">{inactiveCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Weligood wax ma iibsan' : 'Inactive customers'}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Customers Table */}
            {(() => {
              const today = new Date();
              const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              // Helper function to normalize phone numbers for comparison
              const normalizePhone = (phone: string) => phone.replace(/^\+252/, '');
              
              // Get all buyers (phones that have made purchases) - normalized
              const allBuyerPhones = new Set(orders.map(o => normalizePhone(o.customer_phone)));
              
              // Today's registrations
              const todayRegisteredPhones = verifiedPhones.filter(phone => 
                new Date(phone.created_at) >= startOfToday
              );
              
              // Active customers (have purchased)
              const activeCustomers = verifiedPhones.filter(
                phone => allBuyerPhones.has(normalizePhone(phone.phone_number))
              );
              
              // Inactive customers (never purchased)
              const inactiveCustomers = verifiedPhones.filter(
                phone => !allBuyerPhones.has(normalizePhone(phone.phone_number))
              );
              
              // Customers who purchased today
              const todayBuyerPhones = new Set(
                orders
                  .filter(o => new Date(o.created_at) >= startOfToday)
                  .map(o => normalizePhone(o.customer_phone))
              );
              const purchasedTodayCustomers = verifiedPhones.filter(
                phone => todayBuyerPhones.has(normalizePhone(phone.phone_number))
              );
              
              // Filter customers based on selected filter
              const getFilteredCustomers = () => {
                let filtered = verifiedPhones;
                
                if (customerFilter === 'today') {
                  filtered = todayRegisteredPhones;
                } else if (customerFilter === 'active') {
                  filtered = activeCustomers;
                } else if (customerFilter === 'inactive') {
                  filtered = inactiveCustomers;
                } else if (customerFilter === 'purchasedToday') {
                  filtered = purchasedTodayCustomers;
                }
                
                // Apply search filter
                if (customerSearch) {
                  filtered = filtered.filter(phone => 
                    phone.phone_number.includes(customerSearch)
                  );
                }
                
                return filtered;
              };
              
              const filteredCustomers = getFilteredCustomers();
              
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      {language === 'so' ? 'Macaamiisha App-ka' : 'App Customers'}
                    </CardTitle>
                    <CardDescription>
                      {language === 'so' 
                        ? 'Liiska macaamiisha app-ka isdiiwaangeliyay' 
                        : 'List of registered app customers'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Filter Buttons */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Button
                        variant={customerFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCustomerFilter('all')}
                        className="gap-2"
                      >
                        <Users className="h-4 w-4" />
                        {language === 'so' ? 'Dhammaan' : 'All'}
                        <Badge variant="secondary" className="ml-1">{verifiedPhones.length}</Badge>
                      </Button>
                      <Button
                        variant={customerFilter === 'today' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCustomerFilter('today')}
                        className="gap-2 border-green-500/50 hover:bg-green-500/10"
                      >
                        <UserPlus className="h-4 w-4 text-green-500" />
                        {language === 'so' ? 'Cusub Maanta' : 'New Today'}
                        <Badge variant="secondary" className="ml-1 bg-green-500/20 text-green-600">{todayRegisteredPhones.length}</Badge>
                      </Button>
                      <Button
                        variant={customerFilter === 'active' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCustomerFilter('active')}
                        className="gap-2 border-blue-500/50 hover:bg-blue-500/10"
                      >
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                        {language === 'so' ? 'Firfircoon' : 'Active'}
                        <Badge variant="secondary" className="ml-1 bg-blue-500/20 text-blue-600">{activeCustomers.length}</Badge>
                      </Button>
                      <Button
                        variant={customerFilter === 'purchasedToday' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCustomerFilter('purchasedToday')}
                        className="gap-2 border-purple-500/50 hover:bg-purple-500/10"
                      >
                        <Package className="h-4 w-4 text-purple-500" />
                        {language === 'so' ? 'Maanta Iibsatay' : 'Purchased Today'}
                        <Badge variant="secondary" className="ml-1 bg-purple-500/20 text-purple-600">{purchasedTodayCustomers.length}</Badge>
                      </Button>
                      <Button
                        variant={customerFilter === 'inactive' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCustomerFilter('inactive')}
                        className="gap-2 border-orange-500/50 hover:bg-orange-500/10"
                      >
                        <XCircle className="h-4 w-4 text-orange-500" />
                        {language === 'so' ? 'Aan Wax Iibsan' : 'Never Purchased'}
                        <Badge variant="secondary" className="ml-1 bg-orange-500/20 text-orange-600">{inactiveCustomers.length}</Badge>
                      </Button>
                    </div>

                    {/* Search */}
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={language === 'so' ? 'Raadi lambarka...' : 'Search phone number...'}
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2">
                      {filteredCustomers.map((phone, index) => {
                        const hasOrders = allBuyerPhones.has(normalizePhone(phone.phone_number));
                        const isNewToday = new Date(phone.created_at) >= startOfToday;
                        return (
                          <div key={phone.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs">{phone.phone_number}</span>
                              {isNewToday && (
                                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
                                  {language === 'so' ? 'Cusub' : 'New'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{new Date(phone.created_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span>{new Date(phone.last_login_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div>
                              {hasOrders ? (
                                <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-[10px]">
                                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                  {language === 'so' ? 'Firfircoon' : 'Active'}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px]">
                                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                  {language === 'so' ? 'Aan Iibsan' : 'No Orders'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {filteredCustomers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          {language === 'so' ? 'Weli ma jiraan macaamiil' : 'No customers found'}
                        </div>
                      )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>{language === 'so' ? 'Lambarka' : 'Phone Number'}</TableHead>
                            <TableHead>{language === 'so' ? 'Taariikhda Galitaanka' : 'Registered'}</TableHead>
                            <TableHead>{language === 'so' ? 'Login-ka Ugu Dambeeyay' : 'Last Login'}</TableHead>
                            <TableHead>{language === 'so' ? 'Heerka' : 'Status'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCustomers.map((phone, index) => {
                            const hasOrders = allBuyerPhones.has(normalizePhone(phone.phone_number));
                            const isNewToday = new Date(phone.created_at) >= startOfToday;
                            
                            return (
                              <TableRow key={phone.id}>
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-mono">{phone.phone_number}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {new Date(phone.created_at).toLocaleDateString('so-SO', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                    {isNewToday && (
                                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                                        {language === 'so' ? 'Cusub' : 'New'}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {new Date(phone.last_login_at).toLocaleDateString('so-SO', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </TableCell>
                                <TableCell>
                                  {hasOrders ? (
                                    <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      {language === 'so' ? 'Firfircoon' : 'Active'}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                                      <XCircle className="h-3 w-3 mr-1" />
                                      {language === 'so' ? 'Aan Iibsan' : 'No Orders'}
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {filteredCustomers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                {language === 'so' ? 'Weli ma jiraan macaamiil' : 'No customers found'}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Summary */}
                    <div className="mt-4 text-sm text-muted-foreground">
                      {language === 'so' 
                        ? `La helay: ${filteredCustomers.length} macaamiil` 
                        : `Showing: ${filteredCustomers.length} customers`}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          {/* Offline Registrations Tab */}
          <TabsContent value="offline-registrations" className="space-y-6">
            {(() => {
              const today = new Date();
              const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              // Statistics
              const totalRegs = offlineRegistrations.length;
              const activeRegs = offlineRegistrations.filter(r => r.is_active).length;
              const inactiveRegs = offlineRegistrations.filter(r => !r.is_active).length;
              const todayRegs = offlineRegistrations.filter(r => 
                new Date(r.created_at) >= startOfToday
              ).length;
              
              // Filter registrations
              const getFilteredRegs = () => {
                let filtered = offlineRegistrations;
                
                if (offlineRegFilter === 'active') {
                  filtered = filtered.filter(r => r.is_active);
                } else if (offlineRegFilter === 'inactive') {
                  filtered = filtered.filter(r => !r.is_active);
                } else if (offlineRegFilter === 'today') {
                  filtered = filtered.filter(r => new Date(r.created_at) >= startOfToday);
                }
                
                if (offlineRegSearch) {
                  filtered = filtered.filter(r => 
                    r.sender_phone.includes(offlineRegSearch) || 
                    r.receiver_phone.includes(offlineRegSearch)
                  );
                }
                
                return filtered;
              };
              
              const filteredRegs = getFilteredRegs();
              
              // Toggle registration status
              const toggleStatus = async (id: string, currentStatus: boolean) => {
                const { error } = await supabase
                  .from('offline_registrations')
                  .update({ is_active: !currentStatus })
                  .eq('id', id);
                  
                if (error) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: error.message,
                    variant: 'destructive',
                  });
                } else {
                  toast({
                    title: language === 'so' ? 'Guul' : 'Success',
                    description: language === 'so' ? 'Waa la cusboonaysiiyay' : 'Status updated',
                  });
                  setOfflineRegistrations(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
                }
              };
              
              // Delete registration
              const deleteReg = async (id: string) => {
                if (!confirm(language === 'so' ? 'Ma hubtaa inaad tirtirto?' : 'Are you sure you want to delete?')) {
                  return;
                }
                
                const { error } = await supabase
                  .from('offline_registrations')
                  .delete()
                  .eq('id', id);
                  
                if (error) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: error.message,
                    variant: 'destructive',
                  });
                } else {
                  toast({
                    title: language === 'so' ? 'Guul' : 'Success',
                    description: language === 'so' ? 'Waa la tirtiray' : 'Deleted successfully',
                  });
                  setOfflineRegistrations(prev => prev.filter(r => r.id !== id));
                }
              };
              
              // Add new registration
              const addNewRegistration = async () => {
                if (!newRegSenderPhone || !newRegReceiverPhone || !newRegProvider) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: language === 'so' 
                      ? 'Fadlan buuxi dhammaan xannibaadyaha' 
                      : 'Please fill all fields',
                    variant: 'destructive',
                  });
                  return;
                }
                
                setIsAddingReg(true);
                
                // Find provider id from providers list
                const provider = providers.find(p => p.provider_name === newRegProvider);
                
                const { data: insertedReg, error } = await supabase
                  .from('offline_registrations')
                  .insert({
                    sender_phone: newRegSenderPhone,
                    receiver_phone: newRegReceiverPhone,
                    provider_name: newRegProvider,
                    provider_id: provider?.id || null,
                    is_active: true,
                  }).select();
                  
                setIsAddingReg(false);
                
                if (error) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: error.message,
                    variant: 'destructive',
                  });
                } else {
                  toast({
                    title: language === 'so' ? 'Guul' : 'Success',
                    description: language === 'so' 
                      ? 'Macaamiilka waa la diiwaangeliyay' 
                      : 'Customer registered successfully',
                  });
                  // Reset form
                  setNewRegSenderPhone('');
                  setNewRegReceiverPhone('');
                  setNewRegProvider('');
                  setShowAddRegDialog(false);
                  if (insertedReg) setOfflineRegistrations(prev => [...insertedReg as OfflineRegistration[], ...prev]);
                }
              };
              
              // Open edit dialog with existing values
              const openEditReg = (reg: OfflineRegistration) => {
                setEditingReg(reg);
                setEditRegSenderPhone(reg.sender_phone);
                setEditRegReceiverPhone(reg.receiver_phone);
                setEditRegProvider(reg.provider_name);
                setShowEditRegDialog(true);
              };
              
              // Update existing registration
              const updateRegistration = async () => {
                if (!editingReg || !editRegSenderPhone || !editRegReceiverPhone || !editRegProvider) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: language === 'so' 
                      ? 'Fadlan buuxi dhammaan xannibaadyaha' 
                      : 'Please fill all fields',
                    variant: 'destructive',
                  });
                  return;
                }
                
                setIsEditingReg(true);
                
                // Find provider id from providers list
                const provider = providers.find(p => p.provider_name === editRegProvider);
                
                const { error } = await supabase
                  .from('offline_registrations')
                  .update({
                    sender_phone: editRegSenderPhone,
                    receiver_phone: editRegReceiverPhone,
                    provider_name: editRegProvider,
                    provider_id: provider?.id || null,
                  })
                  .eq('id', editingReg.id);
                  
                setIsEditingReg(false);
                
                if (error) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: error.message,
                    variant: 'destructive',
                  });
                } else {
                  toast({
                    title: language === 'so' ? 'Guul' : 'Success',
                    description: language === 'so' 
                      ? 'Macaamiilka waa la cusboonaysiiyay' 
                      : 'Registration updated successfully',
                  });
                  // Reset form
                  setEditingReg(null);
                  setEditRegSenderPhone('');
                  setEditRegReceiverPhone('');
                  setEditRegProvider('');
                  setShowEditRegDialog(false);
                  setOfflineRegistrations(prev => prev.map(r => r.id === editingReg.id ? { ...r, sender_phone: editRegSenderPhone, receiver_phone: editRegReceiverPhone, provider_name: editRegProvider, provider_id: provider?.id || null } : r));
                }
              };

              return (
                <>
                  {/* Statistics Cards */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-primary">
                          {language === 'so' ? 'Wadarta' : 'Total'}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-primary">{totalRegs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'so' ? 'Dhammaan registrations' : 'All registrations'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-600">
                          {language === 'so' ? 'Shaqeynaya' : 'Active'}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-emerald-600">{activeRegs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'so' ? 'Kuwa active' : 'Active registrations'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600">
                          {language === 'so' ? 'Aan Shaqeyn' : 'Inactive'}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                          <XCircle className="h-4 w-4 text-amber-500" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-amber-600">{inactiveRegs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'so' ? 'Kuwa inactive' : 'Inactive registrations'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-500/5 to-transparent shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-sky-600">
                          {language === 'so' ? 'Maanta' : 'Today'}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-full bg-sky-500/10 flex items-center justify-center">
                          <UserPlus className="h-4 w-4 text-sky-500" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-sky-600">{todayRegs}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {language === 'so' ? 'Maanta is-diiwaan' : 'Registered today'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Table Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><WifiOff className="h-5 w-5" /> Offline Registration</CardTitle>
                      <CardDescription>
                        {language === 'so' ? 'Dadka offline isdiiwaan geliyay' : 'Users registered for offline purchases'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Search and Filters */}
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder={language === 'so' ? 'Raadi sender ama receiver...' : 'Search sender or receiver...'}
                            value={offlineRegSearch}
                            onChange={(e) => setOfflineRegSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant={offlineRegFilter === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOfflineRegFilter('all')}
                          >
                            {language === 'so' ? 'Dhammaan' : 'All'} ({totalRegs})
                          </Button>
                          <Button
                            variant={offlineRegFilter === 'active' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOfflineRegFilter('active')}
                          >
                            Active ({activeRegs})
                          </Button>
                          <Button
                            variant={offlineRegFilter === 'inactive' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOfflineRegFilter('inactive')}
                          >
                            Inactive ({inactiveRegs})
                          </Button>
                          <Button
                            variant={offlineRegFilter === 'today' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOfflineRegFilter('today')}
                          >
                            {language === 'so' ? 'Maanta' : 'Today'} ({todayRegs})
                          </Button>
                          <Button
                            onClick={() => setShowAddRegDialog(true)}
                            size="sm"
                            className="bg-primary hover:bg-primary/90"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {language === 'so' ? 'Cusub' : 'Add New'}
                          </Button>
                        </div>
                      </div>

                      {/* Mobile Card View */}
                      <div className="md:hidden space-y-2">
                        {filteredRegs.map((reg) => (
                          <div key={reg.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">{reg.provider_name}</Badge>
                              <Badge variant={reg.is_active ? "default" : "secondary"} className={`text-[10px] ${reg.is_active ? "bg-emerald-500" : ""}`}>
                                {reg.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <div className="text-xs font-mono space-y-0.5">
                              <p>S: +252{reg.sender_phone}</p>
                              <p>R: +252{reg.receiver_phone}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">{new Date(reg.created_at).toLocaleDateString()}</span>
                              <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => openEditReg(reg)}><Pencil className="h-3 w-3" /></Button>
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => toggleStatus(reg.id, reg.is_active)}><Power className="h-3 w-3" /></Button>
                                <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deleteReg(reg.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredRegs.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {language === 'so' ? 'Weli ma jiraan registrations' : 'No registrations found'}
                          </div>
                        )}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>{language === 'so' ? 'Sender' : 'Sender Phone'}</TableHead>
                              <TableHead>{language === 'so' ? 'Receiver' : 'Receiver Phone'}</TableHead>
                              <TableHead>{language === 'so' ? 'Shirkad' : 'Provider'}</TableHead>
                              <TableHead>{language === 'so' ? 'Xaalad' : 'Status'}</TableHead>
                              <TableHead>{language === 'so' ? 'Taarikh' : 'Date'}</TableHead>
                              <TableHead className="text-right">{language === 'so' ? 'Actions' : 'Actions'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRegs.map((reg, index) => (
                              <TableRow key={reg.id}>
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="font-mono">+252{reg.sender_phone}</span></div></TableCell>
                                <TableCell><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="font-mono">+252{reg.receiver_phone}</span></div></TableCell>
                                <TableCell><Badge variant="outline">{reg.provider_name}</Badge></TableCell>
                                <TableCell><Badge variant={reg.is_active ? "default" : "secondary"} className={reg.is_active ? "bg-emerald-500 hover:bg-emerald-600" : ""}>{reg.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                                <TableCell className="text-sm text-muted-foreground">{new Date(reg.created_at).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => openEditReg(reg)}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="outline" size="sm" onClick={() => toggleStatus(reg.id, reg.is_active)}><Power className="h-4 w-4" /></Button>
                                    <Button variant="destructive" size="sm" onClick={() => deleteReg(reg.id)}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {filteredRegs.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                  {language === 'so' ? 'Weli ma jiraan registrations' : 'No registrations found'}
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Summary */}
                      <div className="text-sm text-muted-foreground">
                        {language === 'so' 
                          ? `La helay: ${filteredRegs.length} registration` 
                          : `Showing: ${filteredRegs.length} registrations`}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Add Registration Dialog */}
                  <Dialog open={showAddRegDialog} onOpenChange={setShowAddRegDialog}>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>
                          {language === 'so' ? 'Diiwaangeli Macaamiil Cusub' : 'Register New Customer'}
                        </DialogTitle>
                      </DialogHeader>
                      
                      <div className="grid gap-4 py-4">
                        {/* Sender Phone */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Lambarka Lacag Bixiye' : 'Sender Phone'}</Label>
                          <div className="flex items-center">
                            <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span>
                            <Input
                              placeholder="61xxxxxxx"
                              value={newRegSenderPhone}
                              onChange={(e) => setNewRegSenderPhone(e.target.value.replace(/\D/g, ''))}
                              maxLength={9}
                              className="rounded-l-none"
                            />
                          </div>
                        </div>
                        
                        {/* Receiver Phone */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Lambarka Internet' : 'Receiver Phone'}</Label>
                          <div className="flex items-center">
                            <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span>
                            <Input
                              placeholder="61xxxxxxx"
                              value={newRegReceiverPhone}
                              onChange={(e) => setNewRegReceiverPhone(e.target.value.replace(/\D/g, ''))}
                              maxLength={9}
                              className="rounded-l-none"
                            />
                          </div>
                        </div>
                        
                        {/* Provider Select */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                          <Select value={newRegProvider} onValueChange={setNewRegProvider}>
                            <SelectTrigger>
                              <SelectValue placeholder={language === 'so' ? 'Dooro shirkad...' : 'Select provider...'} />
                            </SelectTrigger>
                            <SelectContent>
                              {providers.filter(p => p.is_active).map((provider) => (
                                <SelectItem key={provider.id} value={provider.provider_name}>
                                  {provider.provider_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddRegDialog(false)}>
                          {language === 'so' ? 'Ka noqo' : 'Cancel'}
                        </Button>
                        <Button onClick={addNewRegistration} disabled={isAddingReg}>
                          {isAddingReg ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {language === 'so' ? 'Kaydinaya...' : 'Saving...'}
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-2" />
                              {language === 'so' ? 'Diiwaangeli' : 'Register'}
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  {/* Edit Registration Dialog */}
                  <Dialog open={showEditRegDialog} onOpenChange={setShowEditRegDialog}>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>
                          {language === 'so' ? 'Wax ka beddel Registration' : 'Edit Registration'}
                        </DialogTitle>
                      </DialogHeader>
                      
                      <div className="grid gap-4 py-4">
                        {/* Sender Phone */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Lambarka Lacag Bixiye' : 'Sender Phone'}</Label>
                          <div className="flex items-center">
                            <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span>
                            <Input
                              placeholder="61xxxxxxx"
                              value={editRegSenderPhone}
                              onChange={(e) => setEditRegSenderPhone(e.target.value.replace(/\D/g, ''))}
                              maxLength={9}
                              className="rounded-l-none"
                            />
                          </div>
                        </div>
                        
                        {/* Receiver Phone */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Lambarka Internet' : 'Receiver Phone'}</Label>
                          <div className="flex items-center">
                            <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">+252</span>
                            <Input
                              placeholder="61xxxxxxx"
                              value={editRegReceiverPhone}
                              onChange={(e) => setEditRegReceiverPhone(e.target.value.replace(/\D/g, ''))}
                              maxLength={9}
                              className="rounded-l-none"
                            />
                          </div>
                        </div>
                        
                        {/* Provider Select */}
                        <div className="grid gap-2">
                          <Label>{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                          <Select value={editRegProvider} onValueChange={setEditRegProvider}>
                            <SelectTrigger>
                              <SelectValue placeholder={language === 'so' ? 'Dooro shirkad...' : 'Select provider...'} />
                            </SelectTrigger>
                            <SelectContent>
                              {providers.filter(p => p.is_active).map((provider) => (
                                <SelectItem key={provider.id} value={provider.provider_name}>
                                  {provider.provider_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditRegDialog(false)}>
                          {language === 'so' ? 'Ka noqo' : 'Cancel'}
                        </Button>
                        <Button onClick={updateRegistration} disabled={isEditingReg}>
                          {isEditingReg ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {language === 'so' ? 'Kaydinaya...' : 'Saving...'}
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              {language === 'so' ? 'Kaydi' : 'Save Changes'}
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </TabsContent>

          {/* Daily Orders Management Tab */}
          <TabsContent value="daily-orders" className="space-y-6">
            <DailyOrdersManager />
          </TabsContent>

          {/* Orders Management Tab */}
          <TabsContent value="orders" className="space-y-6">
            {/* Info Card - How it Works */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  💡 {language === 'so' ? 'Sida Sistemku u Shaqeeyo' : 'How the System Works'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="font-semibold text-sm">1️⃣ Package → Category</div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'so' 
                        ? 'Package walba wuxuu leeyahay category gaar ah (Anfac, Internet, iwm)' 
                        : 'Each package belongs to a specific category (Anfac, Internet, etc.)'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="font-semibold text-sm">2️⃣ Category → Template Code</div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'so' 
                        ? 'Category walba wuxuu leeyahay USSD code template gaar ah' 
                        : 'Each category has its own USSD code template'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="font-semibold text-sm">3️⃣ Order → Auto Dial</div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'so' 
                        ? 'Android app-ka wuxuu automatic u helaa template-ka saxda ah oo dial gareynaa' 
                        : 'Android app automatically finds the right template and dials'}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium mb-1">
                    📌 {language === 'so' ? 'Tusaale:' : 'Example:'}
                  </p>
                  <code className="text-xs bg-background p-2 rounded block">
                    Package "Anfac 1GB" → Category "Anfac" → Template "*101*&#123;receiver_phone&#125;#"
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Code Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingInstructionId 
                    ? (language === 'so' ? 'Wax ka beddel Code-ka' : 'Edit Delivery Code')
                    : (language === 'so' ? 'Ku dar Code Cusub' : 'Add Delivery Code')
                  }
                </CardTitle>
                <CardDescription>
                  {language === 'so' ? 'Gali code-ka iyo tilmaamaha qaabka xirmada loo diro shirkad walba' : 'Enter the code and instructions for sending packages per provider'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{language === 'so' ? 'Shirkadda' : 'Provider'} *</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={newDeliveryInstruction.provider_id}
                      onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, provider_id: e.target.value })}
                    >
                      <option value="">{language === 'so' ? 'Dooro' : 'Select'}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.provider_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>{language === 'so' ? 'Category (Ikhtiyaari)' : 'Category (Optional)'}</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={newDeliveryInstruction.category_id}
                      onChange={(e) => setNewDeliveryInstruction({ 
                        ...newDeliveryInstruction, 
                        category_id: e.target.value,
                        package_id: '' // Reset package when category changes
                      })}
                    >
                      <option value="">{language === 'so' ? 'Guud (All Categories)' : 'General (All Categories)'}</option>
                      {categories
                        .filter(c => !newDeliveryInstruction.provider_id || c.provider_id === newDeliveryInstruction.provider_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.category_name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'so' ? 'Haddii aadan dooran, waxay u shaqayn doontaa dhammaan categories shirkaddan' : 'If not selected, will work for all categories of this provider'}
                    </p>
                  </div>

                  {/* Package Selection - Optional, only when category is selected */}
                  {newDeliveryInstruction.category_id && (
                    <div>
                      <Label>{language === 'so' ? 'Xirmo Gaar ah (Ikhtiyaari)' : 'Specific Package (Optional)'}</Label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={newDeliveryInstruction.package_id}
                        onChange={(e) => setNewDeliveryInstruction({ 
                          ...newDeliveryInstruction, 
                          package_id: e.target.value 
                        })}
                      >
                        <option value="">
                          {language === 'so' ? 'Dhammaan xirmoyinka category-gan' : 'All packages in this category'}
                        </option>
                        {packages
                          .filter(p => 
                            p.category_id === newDeliveryInstruction.category_id &&
                            p.provider_id === newDeliveryInstruction.provider_id
                          )
                          .map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.package_name} - ${pkg.selling_price}
                            </option>
                          ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' 
                          ? 'Xirmo gaar ah dooro haddii code gaar ah u baahan tahay' 
                          : 'Select specific package if it needs a unique code template'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>{language === 'so' ? 'Code Template' : 'Code Template'} *</Label>
                  <Input
                    value={newDeliveryInstruction.code_template}
                    onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, code_template: e.target.value })}
                    placeholder="*729*{receiver_phone}*{data_amount}*{sim_password}#"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === 'so' ? 'Variables: {receiver_phone}, {package_name}, {data_amount}, {customer_phone}, {sim_password}' : 'Variables: {receiver_phone}, {package_name}, {data_amount}, {customer_phone}, {sim_password}'}
                  </p>
                </div>

                <div>
                  <Label>{language === 'so' ? 'SIM Password' : 'SIM Password'}</Label>
                  <Input
                    value={newDeliveryInstruction.sim_password}
                    onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, sim_password: e.target.value })}
                    placeholder={language === 'so' ? 'Gali password-ka SIM-ka' : 'Enter SIM password'}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === 'so' ? 'Password-kan wuxuu ka geli doonaa {sim_password} meesha code-ka' : 'This password will replace {sim_password} in the code template'}
                  </p>
                </div>

                <div>
                  <Label>{language === 'so' ? 'Qoraal Dheeraad ah (Optional)' : 'Additional Notes (Optional)'}</Label>
                  <textarea
                    className="w-full p-2 border rounded-md bg-background"
                    value={newDeliveryInstruction.notes}
                    onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, notes: e.target.value })}
                    placeholder={language === 'so' ? 'Wax kale oo muhiim ah...' : 'Any additional notes...'}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={addDeliveryInstruction} className="flex-1">
                    {editingInstructionId ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    {editingInstructionId 
                      ? (language === 'so' ? 'Kaydi Beddellada' : 'Save Changes')
                      : (language === 'so' ? 'Ku dar' : 'Add Instruction')
                    }
                  </Button>
                  {editingInstructionId && (
                    <Button variant="outline" onClick={cancelEditInstruction}>
                      <X className="h-4 w-4 mr-2" />
                      {language === 'so' ? 'Ka noqo' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Code-yada Delivery' : 'Delivery Codes'}</CardTitle>
                <CardDescription>
                  {language === 'so' ? 'Code-yada waxay u kala horayaan shirkad shirkad' : 'Codes organized by provider'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {providers.map(provider => {
                  const providerInstructions = deliveryInstructions.filter(i => i.provider_id === provider.id);
                  
                  return (
                    <div key={provider.id} className="mb-8 last:mb-0">
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 border-b pb-2">
                        {provider.provider_logo && (
                          <img src={provider.provider_logo} alt={provider.provider_name} className="h-6 w-6 object-contain" />
                        )}
                        {provider.provider_name}
                      </h3>
                      
                        {providerInstructions.length > 0 ? (
                        <>
                          {/* Mobile Card View */}
                          <div className="md:hidden space-y-2">
                            {providerInstructions.map((instruction) => {
                              const category = categories.find(c => c.id === instruction.category_id);
                              const pkg = packages.find(p => p.id === instruction.package_id);
                              return (
                                <div key={instruction.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1 flex-wrap">
                                      {category ? <span className="text-[10px] bg-primary/10 px-1.5 py-0.5 rounded">{category.category_name}</span> : <span className="text-[10px] text-muted-foreground italic">Guud</span>}
                                      {pkg && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">{pkg.package_name}</span>}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditInstruction(instruction)}><Pencil className="h-3 w-3 text-primary" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDeliveryInstruction(instruction.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                    </div>
                                  </div>
                                  <p className="font-mono text-xs truncate">{instruction.code_template || '-'}</p>
                                </div>
                              );
                            })}
                          </div>
                          {/* Desktop Table */}
                          <div className="hidden md:block overflow-x-auto"><Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead>Package</TableHead>
                              <TableHead>Code Template</TableHead>
                              <TableHead>SIM Password</TableHead>
                              <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {providerInstructions.map((instruction) => {
                              const category = categories.find(c => c.id === instruction.category_id);
                              const pkg = packages.find(p => p.id === instruction.package_id);
                              return (
                                <TableRow key={instruction.id}>
                                  <TableCell>{category ? <span className="text-xs bg-primary/10 px-2 py-1 rounded">{category.category_name}</span> : <span className="text-xs text-muted-foreground italic">{language === 'so' ? 'Guud (Dhammaan)' : 'General (All)'}</span>}</TableCell>
                                  <TableCell>{pkg ? <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">{pkg.package_name}</span> : <span className="text-xs text-muted-foreground italic">{language === 'so' ? 'Dhammaan' : 'All'}</span>}</TableCell>
                                  <TableCell className="font-mono text-xs max-w-[150px] truncate">{instruction.code_template || '-'}</TableCell>
                                  <TableCell className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">{instruction.sim_password ? '••••••' : '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => startEditInstruction(instruction)}><Pencil className="h-4 w-4 text-primary" /></Button>
                                      <Button variant="ghost" size="sm" onClick={() => deleteDeliveryInstruction(instruction.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table></div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic py-4">
                          {language === 'so' ? 'Ma jiraan code-yo shirkaddan' : 'No delivery codes configured for this provider'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Maamulka Dalabka' : 'Orders Management'}</CardTitle>
                <CardDescription>
                  {language === 'so' ? 'Eeg oo maamul dhammaan dalabka macaamiisha' : 'View and manage all customer orders'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="space-y-4">
                  {/* Basic Filters Row */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={language === 'so' ? 'Raadi lambarka ama package-ka' : 'Search by phone or package'}
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={orderFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setOrderFilter('all')}
                        size="sm"
                      >
                        {language === 'so' ? 'Dhammaan' : 'All'}
                      </Button>
                      <Button
                        variant={orderFilter === 'pending' ? 'default' : 'outline'}
                        onClick={() => setOrderFilter('pending')}
                        size="sm"
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        {language === 'so' ? 'Sugitaan' : 'Pending'}
                      </Button>
                      <Button
                        variant={orderFilter === 'completed' ? 'default' : 'outline'}
                        onClick={() => setOrderFilter('completed')}
                        size="sm"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {language === 'so' ? 'Dhacay' : 'Completed'}
                      </Button>
                      <Button
                        variant={orderFilter === 'failed' ? 'default' : 'outline'}
                        onClick={() => setOrderFilter('failed')}
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {language === 'so' ? 'Fashilmay' : 'Failed'}
                      </Button>
                      <Button
                        variant={showAdvancedFilters ? "default" : "outline"}
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        size="sm"
                        className={cn((dateFrom || dateTo || providerFilter !== "all" || deliveryStatusFilter !== "all") && "border-primary")}
                      >
                        <Filter className="h-4 w-4 mr-1" />
                        {language === 'so' ? 'Filter' : 'Filter'}
                      </Button>
                    </div>
                  </div>

                  {/* Advanced Filters */}
                  {showAdvancedFilters && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Date From */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">{language === 'so' ? 'Taariikhda Bilowga' : 'Date From'}</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !dateFrom && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateFrom ? format(dateFrom, "PPP") : (language === 'so' ? 'Dooro taariikhda' : 'Pick a date')}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={dateFrom}
                                  onSelect={setDateFrom}
                                  initialFocus
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Date To */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">{language === 'so' ? 'Taariikhda Dhammaadka' : 'Date To'}</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !dateTo && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateTo ? format(dateTo, "PPP") : (language === 'so' ? 'Dooro taariikhda' : 'Pick a date')}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={dateTo}
                                  onSelect={setDateTo}
                                  initialFocus
                                  className="pointer-events-auto"
                                  disabled={(date) => dateFrom ? date < dateFrom : false}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Provider Filter */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">{language === 'so' ? 'Bixiyaha' : 'Provider'}</Label>
                            <Select value={providerFilter} onValueChange={setProviderFilter}>
                              <SelectTrigger>
                                <SelectValue placeholder={language === 'so' ? 'Bixiyaha dooro' : 'Select provider'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All'}</SelectItem>
                                {providers.map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.provider_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Delivery Status Filter */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">{language === 'so' ? 'Xaaladda Delivery' : 'Delivery Status'}</Label>
                            <Select value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter}>
                              <SelectTrigger>
                                <SelectValue placeholder={language === 'so' ? 'Xaaladda dooro' : 'Select status'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All'}</SelectItem>
                                <SelectItem value="pending">{language === 'so' ? 'Sugitaan' : 'Pending'}</SelectItem>
                                <SelectItem value="queued">{language === 'so' ? 'Safka' : 'Queued'}</SelectItem>
                                <SelectItem value="processing">{language === 'so' ? 'Socdaa' : 'Processing'}</SelectItem>
                                <SelectItem value="delivered">{language === 'so' ? 'La Soo Diray' : 'Delivered'}</SelectItem>
                                <SelectItem value="failed">{language === 'so' ? 'Fashilmay' : 'Failed'}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Clear Filters Button */}
                        {(dateFrom || dateTo || providerFilter !== "all" || deliveryStatusFilter !== "all") && (
                          <div className="flex justify-end pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDateFrom(undefined);
                                setDateTo(undefined);
                                setProviderFilter("all");
                                setDeliveryStatusFilter("all");
                              }}
                              className="text-muted-foreground"
                            >
                              <X className="h-4 w-4 mr-2" />
                              {language === 'so' ? 'Tirtir Filters' : 'Clear Filters'}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {filteredOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {language === 'so' ? 'Ma jiraan orders' : 'No orders found'}
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate flex-1">{order.package_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {new Date(order.created_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          <p>C: {order.customer_phone} → R: {order.receiver_phone}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">${order.selling_price}</span>
                          <div className="flex items-center gap-1">
                            {order.status === 'pending' && <Badge className="bg-yellow-500 text-[10px] h-5">Pending</Badge>}
                            {order.status === 'payment_confirmed' && <Badge className="bg-blue-500 text-[10px] h-5">Confirmed</Badge>}
                            {(order.status === 'completed' || order.delivery_status === 'delivered') && <Badge className="bg-green-500 text-[10px] h-5">Completed</Badge>}
                            {(order.status === 'failed' || order.delivery_status === 'failed') && <Badge className="bg-red-500 text-[10px] h-5">Failed</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {order.status === 'pending' && (
                            <>
                              <Button size="sm" className="h-7 text-[10px] bg-green-600 hover:bg-green-700" onClick={() => confirmPayment(order.id)}>Xaqiiji</Button>
                              <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => updateOrderStatus(order.id, 'failed')}><XCircle className="h-3 w-3" /></Button>
                            </>
                          )}
                          {order.status === 'payment_confirmed' && (
                            <Button size="sm" className="h-7 text-[10px]" onClick={() => sendUSSDCode(order)}>Dir USSD</Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Orders Table */}
                <div className="hidden md:block border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'so' ? 'Waqtiga' : 'Date'}</TableHead>
                        <TableHead>{language === 'so' ? 'Macmiilka' : 'Customer'}</TableHead>
                        <TableHead>{language === 'so' ? 'Lambarka Lacagta' : 'Payment From'}</TableHead>
                        <TableHead>{language === 'so' ? 'Receiver' : 'Receiver'}</TableHead>
                        <TableHead>{language === 'so' ? 'Package' : 'Package'}</TableHead>
                        <TableHead>{language === 'so' ? 'Qiimaha' : 'Price'}</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{language === 'so' ? 'Ma jiraan orders' : 'No orders found'}</TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="text-xs">{new Date(order.created_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                            <TableCell className="font-medium">{order.customer_phone}</TableCell>
                            <TableCell className="text-sm">{order.payment_number}</TableCell>
                            <TableCell className="text-sm font-medium">{order.receiver_phone}</TableCell>
                            <TableCell><div><p className="font-medium text-sm">{order.package_name}</p><p className="text-xs text-muted-foreground">{order.data_amount}</p></div></TableCell>
                            <TableCell className="font-semibold">${order.selling_price}</TableCell>
                            <TableCell>
                              {order.status === 'pending' && <div className="flex items-center gap-1 text-yellow-600"><Clock className="h-3 w-3" /><span className="text-xs font-medium">{language === 'so' ? 'Sugitaan' : 'Pending'}</span></div>}
                              {order.status === 'payment_confirmed' && <div className="flex items-center gap-1 text-blue-600"><CheckCircle className="h-3 w-3" /><span className="text-xs font-medium">{language === 'so' ? 'Lacagta Xaqiijisan' : 'Payment Confirmed'}</span></div>}
                              {(order.status === 'completed' || order.delivery_status === 'delivered') && <div className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" /><span className="text-xs font-medium">{language === 'so' ? 'Dhacay' : 'Completed'}</span></div>}
                              {(order.status === 'failed' || order.delivery_status === 'failed') && <div className="flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" /><span className="text-xs font-medium">{language === 'so' ? 'Fashilmay' : 'Failed'}</span></div>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {order.status === 'pending' && (
                                  <>
                                    <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => confirmPayment(order.id)}>{language === 'so' ? 'Lacagta Xaqiiji' : 'Payment Confirmed'}</Button>
                                    <Button size="sm" variant="destructive" onClick={() => updateOrderStatus(order.id, 'failed')}><XCircle className="h-3 w-3" /></Button>
                                  </>
                                )}
                                {order.status === 'payment_confirmed' && (
                                  <Button size="sm" variant="default" onClick={() => sendUSSDCode(order)}>{language === 'so' ? 'Dir USSD Code' : 'Send USSD Code'}</Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* See All Orders Button */}
                {!showAllOrders && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={loadAllOrders}
                      disabled={loadingAllOrders}
                      className="w-full max-w-md"
                    >
                      {loadingAllOrders ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {language === 'so' ? '📋 Dhammaan Dalabyadii Soo Bandhig' : '📋 See All Orders'}
                    </Button>
                  </div>
                )}
                {showAllOrders && (
                  <p className="text-center text-sm text-muted-foreground pt-2">
                    {language === 'so' ? `Dhammaan ${orders.length} dalabyada ayaa la soo bandhigay` : `Showing all ${orders.length} orders`}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="providers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Ku dar Shirkad Cusub' : 'Add New Provider'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload for Logo */}
                <div className="border-2 border-dashed rounded-lg p-4">
                  <input
                    type="file"
                    id="provider-logo-input"
                    accept="image/*"
                    onChange={handleProviderLogoSelect}
                    className="hidden"
                  />
                  
                  {!providerLogoFile && !providerLogoPreview ? (
                    <div className="text-center space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {language === 'so' ? 'Logo Dooro' : 'Upload Logo'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, SVG (max 2MB)
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => document.getElementById('provider-logo-input')?.click()}
                        type="button"
                      >
                        <Upload className="h-3 w-3 mr-2" />
                        {language === 'so' ? 'Dooro Logo' : 'Select Logo'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <img 
                        src={providerLogoPreview} 
                        alt="Logo Preview" 
                        className="h-12 w-12 object-contain rounded"
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium truncate">{providerLogoFile?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {providerLogoFile && (providerLogoFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProviderLogoFile(null);
                          setProviderLogoPreview('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{language === 'so' ? 'Magaca' : 'Name'}</Label>
                    <Input
                      value={newProvider.provider_name}
                      onChange={(e) => setNewProvider({ ...newProvider, provider_name: e.target.value })}
                      placeholder={language === 'so' ? 'Tusaale: Hormuud' : 'e.g. Hormuud'}
                    />
                  </div>
                  <div>
                    <Label>Logo URL ({language === 'so' ? 'Ikhtiyaari' : 'Optional'})</Label>
                    <Input
                      value={newProvider.provider_logo}
                      onChange={(e) => setNewProvider({ ...newProvider, provider_logo: e.target.value })}
                      disabled={!!providerLogoFile}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Qoraalka Xayaysiinta' : 'Promotional Text'}</Label>
                    <Input
                      value={newProvider.promotional_text}
                      onChange={(e) => setNewProvider({ ...newProvider, promotional_text: e.target.value })}
                      placeholder="Riyokaab Data ka iibso Internet..."
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Tartiibtaada' : 'Display Order'}</Label>
                    <Input
                      type="number"
                      value={newProvider.display_order}
                      onChange={(e) => setNewProvider({ ...newProvider, display_order: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <Button onClick={addProvider} className="w-full" disabled={uploadingImage}>
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {language === 'so' ? 'Waa la soo galiyaa...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      {language === 'so' ? 'Ku dar' : 'Add Provider'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Shirkadaha' : 'Providers List'}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {providers.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((provider) => (
                    <div key={provider.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{provider.provider_name}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingProvider(provider); setShowProviderEditDialog(true); }}><Edit className="h-3 w-3 text-primary" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteProvider(provider.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">#{provider.display_order || 0}</span>
                        <Button variant={provider.is_active ? 'default' : 'outline'} size="sm" className="h-6 text-[10px]" onClick={() => toggleProviderStatus(provider.id, provider.is_active)}>
                          {provider.is_active ? 'Active' : 'Inactive'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'so' ? 'Tartiib' : 'Order'}</TableHead>
                        <TableHead>{language === 'so' ? 'Magaca' : 'Name'}</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>API</TableHead>
                        <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providers.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((provider) => (
                        <TableRow key={provider.id}>
                          <TableCell className="font-medium">{provider.display_order || 0}</TableCell>
                          <TableCell className="font-medium">{provider.provider_name}</TableCell>
                          <TableCell><Button variant={provider.is_active ? 'default' : 'outline'} size="sm" onClick={() => toggleProviderStatus(provider.id, provider.is_active)}>{provider.is_active ? (language === 'so' ? 'Shaqeeya' : 'Active') : (language === 'so' ? 'Ma shaqeeyo' : 'Inactive')}</Button></TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => { setEditingProvider(provider); setShowProviderEditDialog(true); }}><Edit className="h-4 w-4 text-primary" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteProvider(provider.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Ku dar Package Cusub' : 'Add New Package'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={newPackage.provider_id}
                      onChange={(e) => setNewPackage({ ...newPackage, provider_id: e.target.value, category_id: '' })}
                    >
                      <option value="">{language === 'so' ? 'Dooro' : 'Select'}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.provider_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Category' : 'Category'}</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={newPackage.category_id}
                      onChange={(e) => setNewPackage({ ...newPackage, category_id: e.target.value })}
                      disabled={!newPackage.provider_id}
                    >
                      <option value="">{language === 'so' ? 'Dooro' : 'Select'}</option>
                      {categories
                        .filter(c => !c.provider_id || c.provider_id === newPackage.provider_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.category_name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Magaca Package' : 'Package Name'}</Label>
                    <Input
                      value={newPackage.package_name}
                      onChange={(e) => setNewPackage({ ...newPackage, package_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Data' : 'Data'}</Label>
                    <Input
                      value={newPackage.data_amount}
                      onChange={(e) => setNewPackage({ ...newPackage, data_amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Qoraalka Connection' : 'Connection Label'}</Label>
                    <Input
                      value={newPackage.connection_type_label}
                      onChange={(e) => setNewPackage({ ...newPackage, connection_type_label: e.target.value })}
                      placeholder="Mobile Internet"
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Maalmo' : 'Days'}</Label>
                    <Input
                      value={validityDaysInput}
                      onChange={(e) => setValidityDaysInput(e.target.value)}
                      placeholder={language === 'so' ? 'Geli maalmo' : 'Enter days'}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Cost Price' : 'Cost'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newPackage.cost_price}
                      onChange={(e) => setNewPackage({ ...newPackage, cost_price: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Selling Price (Macmiilku wuxuu siin doonaa)' : 'Selling Price (Customer Pays)'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newPackage.selling_price}
                      onChange={(e) => setNewPackage({ ...newPackage, selling_price: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Profit Margin (%)' : 'Profit Margin (%)'}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newPackage.profit_margin}
                      onChange={(e) => setNewPackage({ ...newPackage, profit_margin: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>🔒 {language === 'so' ? 'Qiimooyin Gaar ah (Only Me)' : 'Private Prices (Only Me)'}</Label>
                    <Input
                      placeholder="0.31, 0.35, 0.40"
                      value={newSecretPrices}
                      onChange={(e) => setNewSecretPrices(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'so' ? 'Qiimo kasta comma ku kala saar. Macmiilku ma arko; lacagtaas marka la soo diro xirmadan ayaa la aqoonsanayaa.' : 'Separate prices with commas. Customers never see them; incoming payments can still match this package.'}
                    </p>
                  </div>
                </div>
                {newPackage.cost_price > 0 && newPackage.selling_price > 0 && (
                  <div className="p-4 bg-primary/5 rounded-lg space-y-2">
                    <p className="font-semibold text-sm mb-2">{language === 'so' ? 'Xisaabta Automatic:' : 'Automatic Calculation:'}</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{language === 'so' ? '1. Macmiilku wuxuu ku siinayaa:' : '1. Customer pays you:'}</span>
                        <span className="font-mono">${newPackage.selling_price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{language === 'so' ? `2. Faa'iidada kaaga (${newPackage.profit_margin}%):` : `2. Your commission (${newPackage.profit_margin}%):`}</span>
                        <span className="font-mono text-green-600">+${(newPackage.selling_price * (newPackage.profit_margin / 100)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="font-semibold">{language === 'so' ? '3. Wadarta aad heleysid:' : '3. Total you receive:'}</span>
                        <span className="font-mono font-semibold">${(newPackage.selling_price + (newPackage.selling_price * (newPackage.profit_margin / 100))).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{language === 'so' ? '4. Minus qiimaha aad ka iibsato:' : '4. Minus cost price:'}</span>
                        <span className="font-mono text-red-600">-${newPackage.cost_price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="font-semibold text-green-600">{language === 'so' ? 'Faa\'iidada dhammaystiran:' : 'Final Profit:'}</span>
                        <span className="font-mono font-semibold text-green-600">
                          ${formatPrice((newPackage.selling_price + (newPackage.selling_price * (newPackage.profit_margin / 100))) - newPackage.cost_price)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <Button onClick={addPackage} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {language === 'so' ? 'Ku dar' : 'Add'}
                </Button>
              </CardContent>
            </Card>

            {providers.map((provider) => {
              const providerPackages = packages.filter(pkg => pkg.provider_id === provider.id);
              const providerCategories = categories.filter(c => c.provider_id === provider.id);
              
              if (providerPackages.length === 0) return null;
              
              return (
                <Card key={provider.id} className="border-2">
                  <CardHeader className="bg-primary/5">
                    <CardTitle className="flex items-center gap-3">
                      {provider.provider_logo && (
                        <img src={provider.provider_logo} alt={provider.provider_name} className="h-8 w-8 object-contain rounded" />
                      )}
                      <span>{provider.provider_name}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        ({providerPackages.length} {language === 'so' ? 'packages' : 'packages'})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {/* Group packages by category */}
                    {providerCategories.map((category) => {
                      const categoryPackages = providerPackages.filter(pkg => pkg.category_id === category.id);
                      if (categoryPackages.length === 0) return null;
                      
                      return (
                        <div key={category.id} className="mb-8 last:mb-0">
                          <div className="mb-3 flex items-center gap-2">
                            <h4 className="text-lg font-semibold text-primary">{category.category_name}</h4>
                            <span className="text-sm text-muted-foreground">
                              ({categoryPackages.length} {language === 'so' ? 'packages' : 'packages'})
                            </span>
                          </div>
                          {/* Mobile Card View */}
                          <div className="md:hidden space-y-2">
                            {categoryPackages.map((pkg) => {
                              const evoucherRate = providers.find(p => p.id === pkg.provider_id)?.evoucher_rate || 0;
                              const profit = calculatePackageProfit(pkg);
                              let deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && d.package_id === pkg.id);
                              if (!deliveryCode) deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && d.category_id === pkg.category_id && !d.package_id);
                              if (!deliveryCode) deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && !d.category_id && !d.package_id);
                              return (
                                <div key={pkg.id} className="border rounded-lg p-3 bg-card space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold truncate flex-1">{pkg.package_name}</span>
                                    <div className="flex gap-0.5">
                                      <Button variant={pkg.is_active ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] px-1.5" onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}>{pkg.is_active ? 'On' : 'Off'}</Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingPackage(pkg); setEditValidityDaysInput(pkg.validity_days.toString()); setEditSecretPrices(secretPricesOf(pkg).join(', ')); }}><Edit className="h-3 w-3 text-primary" /></Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deletePackage(pkg.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                                    <span>{pkg.data_amount}</span>
                                    <span>${pkg.selling_price}{secretPricesOf(pkg).length > 0 && <span className="ml-1 text-amber-600"> 🔒 {secretPricesOf(pkg).map(v => `${v}`).join(', ')}</span>}</span>
                                    <span className="text-blue-600">{(evoucherRate * 100).toFixed(1)}%</span>
                                    <span className={profit >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>${formatPrice(profit)}</span>
                                  </div>
                                  {deliveryCode && <p className="font-mono text-[10px] text-muted-foreground truncate">{deliveryCode.code_template}</p>}
                                </div>
                              );
                            })}
                          </div>
                          {/* Desktop Table */}
                          <div className="hidden md:block overflow-x-auto"><Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Package</TableHead>
                                <TableHead>Template Code</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>{language === 'so' ? 'Maalmo' : 'Days'}</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>{language === 'so' ? 'Dakhil' : 'Profit'}</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {categoryPackages.map((pkg) => {
                                let deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && d.package_id === pkg.id);
                                let templateSource: 'package' | 'category' | 'provider' = 'package';
                                if (!deliveryCode) { deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && d.category_id === pkg.category_id && !d.package_id); templateSource = 'category'; }
                                if (!deliveryCode) { deliveryCode = deliveryInstructions.find(d => d.provider_id === provider.id && !d.category_id && !d.package_id); templateSource = 'provider'; }
                                return (
                                  <TableRow key={pkg.id}>
                                    <TableCell className="font-medium">{pkg.package_name}</TableCell>
                                    <TableCell>
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                          {deliveryCode ? (
                                            <div className="flex flex-col gap-1">
                                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{deliveryCode.code_template}</code>
                                              <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                                {templateSource === 'package' && <>📦 Package</>}
                                                {templateSource === 'category' && <>📁 Category</>}
                                                {templateSource === 'provider' && <>🏢 General</>}
                                              </span>
                                            </div>
                                          ) : (<span className="text-xs text-destructive">❌ Not set</span>)}
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => { setEditingTemplateCode({ packageId: pkg.id, packageName: pkg.package_name, providerId: provider.id, categoryId: pkg.category_id, currentCode: deliveryCode?.code_template || '', instructionId: deliveryCode?.id || null, templateSource }); setQuickTemplateCode(deliveryCode?.code_template || ''); }}><Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" /></Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>{pkg.data_amount}</TableCell>
                                    <TableCell>{pkg.validity_days}</TableCell>
                                    <TableCell><span>${pkg.selling_price}</span>{secretPricesOf(pkg).length > 0 && <span className="ml-1 text-xs text-amber-600 font-semibold">🔒 {secretPricesOf(pkg).map(v => `${v}`).join(', ')}</span>}</TableCell>
                                    <TableCell className="text-blue-600 font-medium">{((providers.find(p => p.id === pkg.provider_id)?.evoucher_rate || 0) * 100).toFixed(1)}%</TableCell>
                                    <TableCell className={calculatePackageProfit(pkg) >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>${formatPrice(calculatePackageProfit(pkg))}</TableCell>
                                    <TableCell><Button variant={pkg.is_active ? 'default' : 'outline'} size="sm" onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}><Power className="h-3 w-3 mr-1" />{pkg.is_active ? 'On' : 'Off'}</Button></TableCell>
                                    <TableCell><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingPackage(pkg); setEditValidityDaysInput(pkg.validity_days.toString()); setEditSecretPrices(secretPricesOf(pkg).join(', ')); }}><Edit className="h-4 w-4 text-primary" /></Button><Button variant="ghost" size="sm" onClick={() => deletePackage(pkg.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table></div>
                        </div>
                      );
                    })}
                    
                    {/* Packages without category */}
                    {(() => {
                      const uncategorizedPackages = providerPackages.filter(pkg => !pkg.category_id);
                      if (uncategorizedPackages.length === 0) return null;
                      
                      return (
                        <div className="mb-8 last:mb-0">
                          <div className="mb-3 flex items-center gap-2">
                            <h4 className="text-lg font-semibold text-muted-foreground">
                              {language === 'so' ? 'Category la\'aan' : 'No Category'}
                            </h4>
                            <span className="text-sm text-muted-foreground">
                              ({uncategorizedPackages.length} {language === 'so' ? 'packages' : 'packages'})
                            </span>
                          </div>
                          <div className="hidden md:block overflow-x-auto"><Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Package</TableHead>
                                <TableHead>Template Code</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>{language === 'so' ? 'Maalmo' : 'Days'}</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>{language === 'so' ? 'Dakhil' : 'Profit'}</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uncategorizedPackages.map((pkg) => {
                                // Find template code - priority: package-specific > provider-general
                                let deliveryCode = deliveryInstructions.find(
                                  d => d.provider_id === provider.id && d.package_id === pkg.id
                                );
                                let templateSource: 'package' | 'category' | 'provider' = 'package';
                                
                                if (!deliveryCode) {
                                  deliveryCode = deliveryInstructions.find(
                                    d => d.provider_id === provider.id && !d.category_id && !d.package_id
                                  );
                                  templateSource = 'provider';
                                }
                                
                                return (
                                  <TableRow key={pkg.id}>
                                    <TableCell className="font-medium">{pkg.package_name}</TableCell>
                                    <TableCell>
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                          {deliveryCode ? (
                                            <div className="flex flex-col gap-1">
                                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                                {deliveryCode.code_template}
                                              </code>
                                              <span className="text-xs text-muted-foreground italic">
                                                {templateSource === 'package' ? '📦 Package' : '🏢 ' + (language === 'so' ? 'Guud' : 'General')}
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-destructive">
                                              ❌ {language === 'so' ? 'Ma jiro' : 'Not set'}
                                            </span>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 shrink-0"
                                          onClick={() => {
                                            setEditingTemplateCode({
                                              packageId: pkg.id,
                                              packageName: pkg.package_name,
                                              providerId: provider.id,
                                              categoryId: null,
                                              currentCode: deliveryCode?.code_template || '',
                                              instructionId: deliveryCode?.id || null,
                                              templateSource: templateSource,
                                            });
                                            setQuickTemplateCode(deliveryCode?.code_template || '');
                                          }}
                                        >
                                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>{pkg.data_amount}</TableCell>
                                    <TableCell>{pkg.validity_days}</TableCell>
                                    <TableCell><span>${pkg.selling_price}</span>{secretPricesOf(pkg).length > 0 && <span className="ml-1 text-xs text-amber-600 font-semibold">🔒 {secretPricesOf(pkg).map(v => `${v}`).join(', ')}</span>}</TableCell>
                                    <TableCell className="text-blue-600 font-medium">
                                      {((providers.find(p => p.id === pkg.provider_id)?.evoucher_rate || 0) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell className={
                                      (() => {
                                        const evoucherRate = providers.find(p => p.id === pkg.provider_id)?.evoucher_rate || 0;
                                        const profit = calculatePackageProfit(pkg);
                                        return profit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium";
                                      })()
                                    }>
                                      ${(() => {
                                        const evoucherRate = providers.find(p => p.id === pkg.provider_id)?.evoucher_rate || 0;
                                        const profit = calculatePackageProfit(pkg);
                                        return formatPrice(profit);
                                      })()}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant={pkg.is_active ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}
                                      >
                                        <Power className="h-3 w-3 mr-1" />
                                        {pkg.is_active ? (language === 'so' ? 'On' : 'On') : (language === 'so' ? 'Off' : 'Off')}
                                      </Button>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setEditingPackage(pkg);
                                            setEditValidityDaysInput(pkg.validity_days.toString());
                                          }}
                                        >
                                          <Edit className="h-4 w-4 text-primary" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => deletePackage(pkg.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table></div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="featured" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Xirmadaha Ugu Caansan' : 'Featured Packages'}</CardTitle>
                <CardDescription>
                  {language === 'so' 
                    ? 'Xirmadahaan waxay ku muuqan doonaan bogga hore ee dhammaan macaamiisha' 
                    : 'These packages will appear on the home page for all customers'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="mb-4">
                  <Label>{language === 'so' ? 'Dooro xirmad si aad ugu darto' : 'Select a package to feature'}</Label>
                  <div className="grid gap-2 mt-2">
                    {packages.filter(pkg => !featuredPackages.find(fp => fp.package_id === pkg.id)).map(pkg => {
                      const provider = providers.find(p => p.id === pkg.provider_id);
                      return (
                        <div key={pkg.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="font-semibold">{pkg.package_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {provider?.provider_name} - {pkg.data_amount} - ${pkg.selling_price}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => addFeaturedPackage(pkg.id)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {language === 'so' ? 'Ku dar' : 'Add'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">{language === 'so' ? 'Xirmadaha Hadda Caanka ah' : 'Currently Featured'}</h3>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-2">
                    {featuredPackages.map((fp) => {
                      const pkg = packages.find(p => p.id === fp.package_id);
                      const provider = providers.find(p => p.id === pkg?.provider_id);
                      if (!pkg) return null;
                      return (
                        <div key={fp.id} className="border rounded-lg p-3 bg-card flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{pkg.package_name}</p>
                            <p className="text-[10px] text-muted-foreground">{provider?.provider_name} · ${pkg.selling_price}</p>
                          </div>
                          <Button variant="destructive" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFeaturedPackage(fp.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto"><Table>
                    <TableHeader><TableRow>
                      <TableHead>{language === 'so' ? 'Xirmad' : 'Package'}</TableHead>
                      <TableHead>{language === 'so' ? 'Shirkad' : 'Provider'}</TableHead>
                      <TableHead>{language === 'so' ? 'Qiime' : 'Price'}</TableHead>
                      <TableHead>{language === 'so' ? 'Darajo' : 'Order'}</TableHead>
                      <TableHead>{language === 'so' ? 'Xaalad' : 'Status'}</TableHead>
                      <TableHead>{language === 'so' ? 'Ficil' : 'Action'}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {featuredPackages.map((fp) => {
                        const pkg = packages.find(p => p.id === fp.package_id);
                        const provider = providers.find(p => p.id === pkg?.provider_id);
                        if (!pkg) return null;
                        return (
                          <TableRow key={fp.id}>
                            <TableCell><div><p className="font-medium">{pkg.package_name}</p><p className="text-sm text-muted-foreground">{pkg.data_amount}</p></div></TableCell>
                            <TableCell>{provider?.provider_name}</TableCell>
                            <TableCell><span>${pkg.selling_price}</span>{secretPricesOf(pkg).length > 0 && <span className="ml-1 text-xs text-amber-600 font-semibold">🔒 {secretPricesOf(pkg).map(v => `${v}`).join(', ')}</span>}</TableCell>
                            <TableCell>{fp.display_order}</TableCell>
                            <TableCell><span className={`px-2 py-1 rounded text-xs ${fp.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{fp.is_active ? 'Active' : 'Inactive'}</span></TableCell>
                            <TableCell><Button variant="destructive" size="sm" onClick={() => removeFeaturedPackage(fp.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Ku dar Category Cusub' : 'Add New Category'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                    <select
                      value={newCategory.provider_id}
                      onChange={(e) => setNewCategory({ ...newCategory, provider_id: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="">{language === 'so' ? 'Dooro Shirkad' : 'Select Provider'}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.provider_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Magaca Category' : 'Category Name'}</Label>
                    <Input
                      value={newCategory.category_name}
                      onChange={(e) => setNewCategory({ ...newCategory, category_name: e.target.value })}
                      placeholder={language === 'so' ? 'Tusaale: Daily, Weekly' : 'e.g. Daily, Weekly'}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Tartib' : 'Display Order'}</Label>
                    <Input
                      type="number"
                      value={newCategory.display_order}
                      onChange={(e) => setNewCategory({ ...newCategory, display_order: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                
                {/* Category Image Upload */}
                <div className="space-y-2">
                  <Label>{language === 'so' ? 'Sawirka Category' : 'Category Image (Optional)'}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleCategoryImageSelect}
                      className="flex-1"
                    />
                    {categoryImagePreview && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearCategoryImageFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {categoryImagePreview && (
                    <div className="mt-2">
                      <img
                        src={categoryImagePreview}
                        alt="Preview"
                        className="h-20 w-20 object-contain border rounded"
                      />
                    </div>
                  )}
                </div>

                <Button onClick={addCategory} className="w-full" disabled={uploadingImage}>
                  {uploadingImage ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  {language === 'so' ? 'Ku dar' : 'Add Category'}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{language === 'so' ? 'Filter' : 'Filter'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label>{language === 'so' ? 'Dooro Shirkad' : 'Select Provider'}</Label>
                  <select
                    value={selectedCategoryProvider}
                    onChange={(e) => setSelectedCategoryProvider(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="all">{language === 'so' ? 'Dhammaan Shirkadaha' : 'All Providers'}</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.provider_name}</option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {providers
                .filter(p => selectedCategoryProvider === 'all' || p.id === selectedCategoryProvider)
                .map(provider => {
                  const providerCategories = categories.filter(c => c.provider_id === provider.id);
                  if (providerCategories.length === 0 && selectedCategoryProvider !== 'all') return null;
                  
                  return (
                    <Card key={provider.id} className="border-2">
                      <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-3">
                          {provider.provider_logo && (
                            <img src={provider.provider_logo} alt={provider.provider_name} className="h-8 w-8 object-contain rounded" />
                          )}
                          <span>{provider.provider_name}</span>
                          <span className="text-sm font-normal text-muted-foreground">
                            ({providerCategories.length} {language === 'so' ? 'categories' : 'categories'})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        {providerCategories.length > 0 ? (
                          <>
                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-2">
                              {providerCategories.map((category) => (
                                <div key={category.id} className="border rounded-lg p-3 bg-card flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-semibold">{category.category_name}</p>
                                    <p className="text-[10px] text-muted-foreground">#{category.display_order}</p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button variant={category.is_active ? 'default' : 'outline'} size="sm" className="h-6 text-[10px]" onClick={() => toggleCategoryStatus(category.id, category.is_active)}>{category.is_active ? 'On' : 'Off'}</Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCategory(category); setShowCategoryEditDialog(true); }}><Edit className="h-3 w-3" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCategory(category.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto"><Table>
                              <TableHeader><TableRow>
                                <TableHead>{language === 'so' ? 'Magaca' : 'Name'}</TableHead>
                                <TableHead>{language === 'so' ? 'Tartib' : 'Order'}</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>
                                {providerCategories.map((category) => (
                                  <TableRow key={category.id}>
                                    <TableCell className="font-medium">{category.category_name}</TableCell>
                                    <TableCell>{category.display_order}</TableCell>
                                    <TableCell><Button variant={category.is_active ? 'default' : 'outline'} size="sm" onClick={() => toggleCategoryStatus(category.id, category.is_active)}>{category.is_active ? (language === 'so' ? 'Shaqeeya' : 'Active') : (language === 'so' ? 'Ma shaqeeyo' : 'Inactive')}</Button></TableCell>
                                    <TableCell><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { setEditingCategory(category); setShowCategoryEditDialog(true); }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => deleteCategory(category.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table></div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            {language === 'so' ? 'Ma jiraan categories shirkaddan' : 'No categories for this provider'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>

          {/* Pricing Management Tab */}
          <TabsContent value="pricing" className="space-y-6">
            {/* Package Pricing Management */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Qiimaha Xirmooyin (Package Pricing)' : 'Package Pricing'}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  {language === 'so' ? 'Halkan ka maaree qiimaha aad ka iibsato iyo qiimaha aad ku iibiso macaamiisha' : 'Manage cost and selling prices for packages'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {packages.map((pkg) => {
                    const provider = providers.find(p => p.id === pkg.provider_id);
                    const profitMargin = pkg.profit_margin || 15;
                    const commission = pkg.selling_price * (profitMargin / 100);
                    const totalReceived = pkg.selling_price + commission;
                    const actualProfit = calculatePackageProfit(pkg);
                    
                    return (
                      <div key={pkg.id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{pkg.package_name}</p>
                            <p className="text-sm text-muted-foreground">{provider?.provider_name}</p>
                            <p className="text-sm text-muted-foreground">{pkg.data_amount} - {pkg.validity_days} days</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newCostPrice = prompt('Cost Price ($):', pkg.cost_price.toString());
                              const newSellingPrice = prompt('Selling Price ($):', pkg.selling_price.toString());
                              if (newCostPrice && newSellingPrice) {
                                updatePackagePricing(pkg.id, parseFloat(newCostPrice), parseFloat(newSellingPrice));
                              }
                            }}
                          >
                            {language === 'so' ? 'Wax ka Beddel' : 'Edit'}
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/50 p-3 rounded">
                          <div>
                            <p className="text-muted-foreground text-xs">{language === 'so' ? '1. Macmiilku wuxuu siinayaa:' : '1. Customer pays:'}</p>
                            <p className="font-semibold">${pkg.selling_price.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{language === 'so' ? `2. Faa'iidada kaaga (${profitMargin}%):` : `2. Your commission (${profitMargin}%):`}</p>
                            <p className="font-semibold text-green-600">+${commission.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{language === 'so' ? '3. Wadarta aad heleysid:' : '3. Total received:'}</p>
                            <p className="font-semibold">${totalReceived.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{language === 'so' ? '4. Cost price:' : '4. Cost price:'}</p>
                            <p className="font-semibold text-red-600">-${pkg.cost_price.toFixed(2)}</p>
                          </div>
                          <div className="col-span-2 border-t pt-2 mt-1">
                            <p className="text-muted-foreground text-xs">{language === 'so' ? 'Faa\'iidada dhammaystiran:' : 'Final Profit:'}</p>
                            <p className="font-bold text-green-600 text-lg">${actualProfit.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Customer-Specific Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Qiimo Gaar ah Macaamiil (Customer-Specific Pricing)' : 'Customer-Specific Pricing'}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  {language === 'so' ? 'Macaamiil gaar ah qiimo ka duwan sii' : 'Give specific customers different pricing'}
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={addCustomerDiscount} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{language === 'so' ? 'Telefoonka Macmiilka' : 'Customer Phone'}</Label>
                      <Input name="customer_phone" placeholder="252615000000" required />
                    </div>
                    <div>
                      <Label>{language === 'so' ? 'Nooca Discount-ka' : 'Discount Type'}</Label>
                      <select name="discount_type" className="w-full p-2 border rounded" required>
                        <option value="fixed">Fixed Amount ($)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div>
                      <Label>{language === 'so' ? 'Qiimaha Discount-ka' : 'Discount Value'}</Label>
                      <Input name="discount_value" type="number" step="0.01" placeholder="0.05" required />
                    </div>
                    <div>
                      <Label>{language === 'so' ? 'U Gaar ah' : 'Applies To'}</Label>
                      <select name="applicable_to" className="w-full p-2 border rounded" required>
                        <option value="all">{language === 'so' ? 'Dhammaan Xirmooyin' : 'All Packages'}</option>
                        <option value="provider">{language === 'so' ? 'Shirkad Gaar ah' : 'Specific Provider'}</option>
                        <option value="package">{language === 'so' ? 'Xirmo Gaar ah' : 'Specific Package'}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Qoraal Faahfaahsan (Optional)' : 'Notes (Optional)'}</Label>
                    <textarea name="notes" className="w-full p-2 border rounded" rows={2} placeholder={language === 'so' ? 'Sabab...' : 'Reason...'} />
                  </div>
                  <Button type="submit">{language === 'so' ? 'Ku Dar Discount' : 'Add Discount'}</Button>
                </form>

                <div className="mt-6 space-y-2">
                  {customerDiscounts.map((discount) => (
                    <div key={discount.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <p className="font-semibold">{discount.customer_phone}</p>
                        <p className="text-sm text-muted-foreground">
                          {discount.discount_type === 'percentage' ? `${discount.discount_value}% off` : `$${discount.discount_value} off`}
                        </p>
                        {discount.notes && <p className="text-xs text-muted-foreground mt-1">{discount.notes}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteCustomerDiscount(discount.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pricing Example */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Tusaale Xisaab Faa\'iido' : 'Profit Calculation Example'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="font-semibold">{language === 'so' ? 'Tusaale: Maalinle (Hormuud)' : 'Example: Daily Package (Hormuud)'}</p>
                  <div className="space-y-1 text-sm">
                    <p>1. {language === 'so' ? 'Qiimaha aad ka iibsato shirka (Cost):' : 'Cost from provider:'} <span className="font-semibold">$0.80</span></p>
                    <p>2. {language === 'so' ? 'Qiimaha aad macaamiilka ku iibiso:' : 'Your selling price:'} <span className="font-semibold">$0.75</span></p>
                    <p>3. {language === 'so' ? 'Profit margin-kaaga (%15):' : 'Your profit margin (15%):'} <span className="font-semibold">$0.75 × 0.15 = $0.11</span></p>
                    <p>4. Total received: <span className="font-semibold">$0.75 + $0.11 = $0.86</span></p>
                    <p>5. {language === 'so' ? 'Minus cost price:' : 'Minus cost:'} <span className="font-semibold">$0.86 - $0.80 = $0.06</span></p>
                    <p className="font-semibold text-green-600 mt-2">{language === 'so' ? 'Faa\'iidada = $0.06' : 'Your Profit = $0.06'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Ku dar Payment Provider' : 'Add Payment Provider'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload for Payment Provider Logo */}
                <div className="border-2 border-dashed rounded-lg p-4">
                  <input
                    type="file"
                    id="payment-provider-logo-input"
                    accept="image/*"
                    onChange={handlePaymentProviderLogoSelect}
                    className="hidden"
                  />
                  
                  {!paymentProviderLogoFile && !paymentProviderLogoPreview ? (
                    <div className="text-center space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {language === 'so' ? 'Logo Dooro' : 'Upload Logo'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, SVG (max 2MB)
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => document.getElementById('payment-provider-logo-input')?.click()}
                        type="button"
                      >
                        <Upload className="h-3 w-3 mr-2" />
                        {language === 'so' ? 'Dooro Logo' : 'Select Logo'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <img 
                        src={paymentProviderLogoPreview} 
                        alt="Logo Preview" 
                        className="h-12 w-12 object-contain rounded"
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium truncate">{paymentProviderLogoFile?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {paymentProviderLogoFile && (paymentProviderLogoFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPaymentProviderLogoFile(null);
                          setPaymentProviderLogoPreview('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>{language === 'so' ? 'Magaca' : 'Name'}</Label>
                    <Input
                      value={newPaymentProvider.provider_name}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, provider_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Logo URL ({language === 'so' ? 'Ikhtiyaari' : 'Optional'})</Label>
                    <Input
                      value={newPaymentProvider.provider_logo}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, provider_logo: e.target.value })}
                      disabled={!!paymentProviderLogoFile}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div>
                    <Label>Commission %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newPaymentProvider.commission_rate}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, commission_rate: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Prefix Code' : 'Prefix Code'}</Label>
                    <Input
                      value={newPaymentProvider.prefix_code}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, prefix_code: e.target.value })}
                      placeholder="61, 62, 68..."
                      maxLength={2}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'so' ? 'Tusaale: EVC=61, E-Dahab=62, Jeeb=68' : 'Example: EVC=61, E-Dahab=62, Jeeb=68'}
                    </p>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Lambarka Lacagta' : 'Payment Number'}</Label>
                    <Input
                      value={newPaymentProvider.payment_number}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, payment_number: e.target.value })}
                      placeholder="617195659"
                    />
                  </div>
                  <div>
                    <Label>USSD Code Template (Payment)</Label>
                    <Input
                      value={newPaymentProvider.ussd_code_template}
                      onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, ussd_code_template: e.target.value })}
                      placeholder="*712*{phone}*{price}#"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'so' 
                        ? 'Placeholders: {payment_number} = Lambarka halkan, {customer_phone}/{phone} = Macmiilka, {receiver_phone} = SIM-ka, {price}/{amount}, {password}/{sim_password}' 
                        : 'Placeholders: {payment_number} = This merchant number, {customer_phone}/{phone} = Customer payer, {receiver_phone} = Receiving SIM, {price}/{amount}, {password}/{sim_password}'}
                    </p>
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      {language === 'so'
                        ? '{payment_number} wuxuu noqonayaa lambarka aad halkan gelisay (merchant number)'
                        : '{payment_number} will be replaced with the merchant number you enter here'}
                    </p>
                  </div>
                </div>
                <Button onClick={addPaymentProvider} className="w-full" disabled={uploadingImage}>
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {language === 'so' ? 'Waa la soo galiyaa...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      {language === 'so' ? 'Ku dar' : 'Add'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Providers</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {paymentProviders.map((provider) => (
                    <div key={provider.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{provider.provider_name}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPaymentProvider(provider); setEditPaymentNumber(provider.payment_number || ''); setEditPrefixCode(provider.prefix_code || ''); setEditUssdTemplate(provider.ussd_code_template || ''); setEditCommissionRate(String(provider.commission_rate)); }}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePaymentProvider(provider.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <p>Prefix: {provider.prefix_code || '-'} · Commission: {provider.commission_rate}%</p>
                        <p className="font-mono truncate">USSD: {provider.ussd_code_template || '-'}</p>
                        {provider.payment_number && <p className="font-mono">{provider.payment_number}</p>}
                      </div>
                      <Badge variant={provider.is_active ? "default" : "secondary"} className="text-[10px]">{provider.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>{language === 'so' ? 'Magaca' : 'Name'}</TableHead>
                      <TableHead>{language === 'so' ? 'Prefix' : 'Prefix'}</TableHead>
                      <TableHead>{language === 'so' ? 'Lambarka' : 'Number'}</TableHead>
                      <TableHead>USSD Template (Payment)</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentProviders.map((provider) => (
                      <TableRow key={provider.id}>
                        <TableCell className="font-medium">{provider.provider_name}</TableCell>
                        <TableCell className="text-sm font-mono">{provider.prefix_code || '-'}</TableCell>
                        <TableCell className="text-sm">{provider.payment_number ? <a href={`tel:+252${provider.payment_number}`} className="font-mono underline">{provider.payment_number}</a> : '-'}</TableCell>
                        <TableCell className="text-xs font-mono break-all max-w-[150px]">{provider.ussd_code_template || '-'}</TableCell>
                        <TableCell>{provider.commission_rate}%</TableCell>
                        <TableCell>{provider.is_active ? 'Active' : 'Inactive'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingPaymentProvider(provider); setEditPaymentNumber(provider.payment_number || ''); setEditPrefixCode(provider.prefix_code || ''); setEditUssdTemplate(provider.ussd_code_template || ''); setEditCommissionRate(String(provider.commission_rate)); }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deletePaymentProvider(provider.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banners" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Ku dar Banner Cusub' : 'Add New Banner'}</CardTitle>
                <CardDescription>
                  {language === 'so' 
                    ? 'Dooro sawirka computer-kaaga ama gali URL' 
                    : 'Upload an image from your computer or enter a URL'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload Section with Drag & Drop */}
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center space-y-4 transition-colors ${
                    isDragging 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    id="banner-file-input"
                    accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {!selectedFile && !previewUrl ? (
                    <div className="space-y-3">
                      <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {language === 'so' 
                            ? 'Riix halkan ama soo jiid file-ka' 
                            : 'Click to upload or drag and drop'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {language === 'so' 
                            ? 'Sawir ama Video (max 10MB)' 
                            : 'Image or Video (max 10MB)'}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => document.getElementById('banner-file-input')?.click()}
                        type="button"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {language === 'so' ? 'Dooro File' : 'Select File'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative inline-block">
                        {selectedFile?.type.startsWith('video/') ? (
                          <video 
                            src={previewUrl} 
                            className="max-h-40 rounded-lg" 
                            controls
                          />
                        ) : (
                          <img 
                            src={previewUrl} 
                            alt="Preview" 
                            className="max-h-40 rounded-lg"
                          />
                        )}
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2"
                          onClick={clearSelectedFile}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedFile?.name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      {language === 'so' ? 'Ama' : 'Or'}
                    </span>
                  </div>
                </div>

                {/* URL Input Section */}
                <div className="grid gap-4 md:grid-cols-5">
                  <div>
                    <Label>{language === 'so' ? 'Media URL (Sawir ama Video)' : 'Media URL (Image or Video)'}</Label>
                    <Input
                      value={newBanner.banner_image}
                      onChange={(e) => setNewBanner({ ...newBanner, banner_image: e.target.value })}
                      placeholder="https://example.com/banner.mp4"
                      disabled={!!selectedFile}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Alt Text' : 'Alt Text'}</Label>
                    <Input
                      value={newBanner.alt_text}
                      onChange={(e) => setNewBanner({ ...newBanner, alt_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Muddo Video (seconds)' : 'Video Duration (sec)'}</Label>
                    <Input
                      type="number"
                      value={newBanner.video_duration || ''}
                      onChange={(e) => setNewBanner({ ...newBanner, video_duration: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Waqti Is-badal (seconds)' : 'Rotation Time (sec)'}</Label>
                    <Input
                      type="number"
                      value={newBanner.rotation_interval || ''}
                      onChange={(e) => setNewBanner({ ...newBanner, rotation_interval: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="4"
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Tartib' : 'Display Order'}</Label>
                    <Input
                      type="number"
                      value={newBanner.display_order}
                      onChange={(e) => setNewBanner({ ...newBanner, display_order: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <Button onClick={addBanner} className="w-full" disabled={uploadingImage}>
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {language === 'so' ? 'Waa la soo galiyaa...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      {language === 'so' ? 'Ku dar' : 'Add Banner'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Banners' : 'Banners List'}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {banners.map((banner) => (
                    <div key={banner.id} className="border rounded-lg p-3 bg-card space-y-2">
                      <div className="flex gap-3">
                        {banner.media_type === 'video' ? (
                          <video src={banner.banner_image} className="h-16 w-24 object-cover rounded" controls preload="metadata" />
                        ) : (
                          <img src={banner.banner_image} alt={banner.alt_text || ''} className="h-16 w-24 object-cover rounded" onClick={() => window.open(banner.banner_image, '_blank')} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{banner.alt_text || 'No alt text'}</p>
                          <p className="text-[10px] text-muted-foreground">#{banner.display_order} · {banner.is_active ? '✅ Active' : '❌ Inactive'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => toggleBannerStatus(banner.id, banner.is_active)}><Power className="h-3 w-3" /></Button>
                        <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={() => deleteBanner(banner.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead>{language === 'so' ? 'Media (Sawir/Video)' : 'Media (Image/Video)'}</TableHead>
                      <TableHead>Alt Text</TableHead>
                      <TableHead>{language === 'so' ? 'Muddo Video' : 'Video Duration'}</TableHead>
                      <TableHead>{language === 'so' ? 'Waqti Is-badal' : 'Rotation Time'}</TableHead>
                      <TableHead>{language === 'so' ? 'Tartib' : 'Order'}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banners.map((banner) => (
                      <TableRow key={banner.id}>
                        <TableCell>
                          {banner.media_type === 'video' ? (
                            <video src={banner.banner_image} className="h-32 w-48 object-cover rounded-lg" controls preload="metadata" />
                          ) : (
                            <img src={banner.banner_image} alt={banner.alt_text || ''} className="h-32 w-48 object-cover rounded-lg cursor-pointer" onClick={() => window.open(banner.banner_image, '_blank')} />
                          )}
                        </TableCell>
                        <TableCell>{banner.alt_text}</TableCell>
                        <TableCell>{banner.media_type === 'video' ? <Input type="number" value={banner.video_duration || ''} onChange={async (e) => { const v = e.target.value ? parseInt(e.target.value) : null; const { error } = await supabase.from('banners_config').update({ video_duration: v }).eq('id', banner.id); if (!error) setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, video_duration: v } : b)); }} className="w-20" placeholder="10" /> : '-'}</TableCell>
                        <TableCell><Input type="number" value={banner.rotation_interval || ''} onChange={async (e) => { const v = e.target.value ? parseInt(e.target.value) : null; const { error } = await supabase.from('banners_config').update({ rotation_interval: v }).eq('id', banner.id); if (!error) setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, rotation_interval: v } : b)); }} className="w-20" placeholder="4" /></TableCell>
                        <TableCell>{banner.display_order}</TableCell>
                        <TableCell>{banner.is_active ? <span className="text-green-600">Active</span> : <span className="text-red-600">Inactive</span>}</TableCell>
                        <TableCell><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => toggleBannerStatus(banner.id, banner.is_active)}><Power className="h-4 w-4" /></Button><Button variant="destructive" size="sm" onClick={() => deleteBanner(banner.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Error Messages Management Tab */}
          <TabsContent value="errors" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'so' ? 'Maamulka Fariimaha Khaladka' : 'Error Messages Management'}</CardTitle>
                <CardDescription>
                  {language === 'so' 
                    ? 'Halkan ka beddel fariimaha khaladka, emoji, iyo animation' 
                    : 'Manage error messages, icons, and animations'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ErrorMessagesManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Devices Management Tab - Single Source of Truth for Device Data */}
          {/* Always render DeviceManagement to ensure devices are loaded */}
          {shouldRenderDeviceManagement && <div className={activeTab === 'devices' ? '' : 'hidden'}>
            <DeviceManagement onDevicesChange={handleDevicesChange} />
          </div>}

          {/* SMS Payments Tab */}
          <TabsContent value="sms-payments" className="space-y-6">
            <PaymentSmsLog />
          </TabsContent>

          {/* Unmatched Payments Tab */}
          <TabsContent value="unmatched" className="space-y-6">
            <UnmatchedPayments />
          </TabsContent>

          {/* Offline Payment Settings Tab */}
          <TabsContent value="offline-payment" className="space-y-6">
            <OfflinePaymentSettings />
          </TabsContent>

          {/* Balance Management Tab */}
          <TabsContent value="balance" className="space-y-6">
            <BalanceManagement />
          </TabsContent>

          {/* Company Finances Tab */}
          <TabsContent value="company-finances" className="space-y-4">
            <CompanyFinances />
          </TabsContent>

          {/* Delivery Rules Tab */}
          <TabsContent value="delivery-rules" className="space-y-6">
            <PackageDeliveryRules />
          </TabsContent>

          <TabsContent value="blocked-users" className="space-y-6">
            <BlockedUsersManager />
          </TabsContent>

          <TabsContent value="bulk-sms" className="space-y-6">
            <BulkSmsManager />
          </TabsContent>

          <TabsContent value="auto-topup" className="space-y-6">
            <AutoTopUpSettings />
          </TabsContent>

          <TabsContent value="audit-log" className="space-y-6">
            <AuditLogViewer />
          </TabsContent>

          <TabsContent value="admin-management" className="space-y-6">
            <AdminManagement />
          </TabsContent>

          <TabsContent value="fraud-alerts" className="space-y-6">
            <FraudAlerts />
          </TabsContent>

          {/* Apps / APK Releases Tab */}
          <TabsContent value="apps" className="space-y-6">
            <AppReleasesManager />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <AppSettings />
          </TabsContent>
                </Suspense>
              </Tabs>
            </div>
          </main>
        </div>
      </div>

      {/* Edit Package Modal */}
        {editingPackage && (
          <Dialog open={!!editingPackage} onOpenChange={() => setEditingPackage(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{language === 'so' ? 'Edit Package' : 'Edit Package'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{language === 'so' ? 'Magaca Package' : 'Package Name'}</Label>
                    <Input
                      value={editingPackage.package_name}
                      onChange={(e) => setEditingPackage({ ...editingPackage, package_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Data' : 'Data'}</Label>
                    <Input
                      value={editingPackage.data_amount}
                      onChange={(e) => setEditingPackage({ ...editingPackage, data_amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Category' : 'Category'}</Label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={editingPackage.category_id || ''}
                      onChange={(e) => setEditingPackage({ ...editingPackage, category_id: e.target.value })}
                    >
                      <option value="">{language === 'so' ? 'Dooro' : 'Select'}</option>
                      {providers.map((provider) => {
                        const providerCategories = categories.filter(c => c.provider_id === provider.id);
                        if (providerCategories.length === 0) return null;
                        return (
                          <optgroup key={provider.id} label={provider.provider_name}>
                            {providerCategories.map((c) => (
                              <option key={c.id} value={c.id}>{c.category_name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Qoraalka Connection' : 'Connection Label'}</Label>
                    <Input
                      value={editingPackage.connection_type_label}
                      onChange={(e) => setEditingPackage({ ...editingPackage, connection_type_label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Maalmo' : 'Days'}</Label>
                    <Input
                      value={editValidityDaysInput}
                      onChange={(e) => setEditValidityDaysInput(e.target.value)}
                      placeholder={language === 'so' ? 'Geli maalmo' : 'Enter days'}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Cost Price' : 'Cost'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editingPackage.cost_price}
                      onChange={(e) => setEditingPackage({ ...editingPackage, cost_price: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>{language === 'so' ? 'Selling Price' : 'Price'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editingPackage.selling_price}
                      onChange={(e) => setEditingPackage({ ...editingPackage, selling_price: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>🔒 {language === 'so' ? 'Qiimooyin Gaar ah (Only Me)' : 'Private Prices (Only Me)'}</Label>
                    <Input
                      placeholder="0.31, 0.35, 0.40"
                      value={editSecretPrices}
                      onChange={(e) => setEditSecretPrices(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'so' ? 'Qiimo kasta comma ku kala saar. Qiimayaashan customer-ka ma arko.' : 'Separate prices with commas. These prices are hidden from customers.'}
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-primary/5 rounded-lg">
                  <p className="text-sm font-medium">
                    {language === 'so' ? 'Dakhliga:' : 'Profit:'} ${(() => {
                      return formatPrice(calculatePackageProfit(editingPackage));
                    })()}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPackage(null)}>
                  {language === 'so' ? 'Ka noqo' : 'Cancel'}
                </Button>
                <Button onClick={updatePackage}>
                  {language === 'so' ? 'Badal' : 'Update'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Provider Dialog */}
        {editingProvider && (
          <Dialog open={showProviderEditDialog} onOpenChange={() => {
            setShowProviderEditDialog(false);
            setEditingProvider(null);
            setProviderLogoFile(null);
            setProviderLogoPreview('');
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{language === 'so' ? 'Badal Shirkadda' : 'Edit Provider'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Logo Upload */}
                <div className="space-y-2">
                  <Label>{language === 'so' ? 'Logo' : 'Logo (Optional)'}</Label>
                  {editingProvider.provider_logo && !providerLogoPreview && (
                    <div className="mb-2">
                      <img
                        src={editingProvider.provider_logo}
                        alt="Current"
                        className="h-20 w-20 object-contain border rounded"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Logo hadda' : 'Current logo'}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleProviderLogoSelect}
                      className="flex-1"
                    />
                    {providerLogoPreview && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setProviderLogoFile(null);
                          setProviderLogoPreview('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {providerLogoPreview && (
                    <div className="mt-2">
                      <img
                        src={providerLogoPreview}
                        alt="Preview"
                        className="h-20 w-20 object-contain border rounded"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label>{language === 'so' ? 'Magaca' : 'Name'}</Label>
                  <Input
                    value={editingProvider.provider_name}
                    onChange={(e) => setEditingProvider({ ...editingProvider, provider_name: e.target.value })}
                    placeholder={language === 'so' ? 'Tusaale: Hormuud' : 'e.g. Hormuud'}
                  />
                </div>
                <div>
                </div>
                <div>
                  <Label>{language === 'so' ? 'Qoraalka Xayaysiinta' : 'Promotional Text'}</Label>
                  <Input
                    value={editingProvider.promotional_text || ''}
                    onChange={(e) => setEditingProvider({ ...editingProvider, promotional_text: e.target.value })}
                    placeholder="Riyokaab Data ka iibso Internet..."
                  />
                </div>
                <div>
                  <Label>{language === 'so' ? 'Tartiibtaada' : 'Display Order'}</Label>
                  <Input
                    type="number"
                    value={editingProvider.display_order || 0}
                    onChange={(e) => setEditingProvider({ ...editingProvider, display_order: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowProviderEditDialog(false);
                  setEditingProvider(null);
                  setProviderLogoFile(null);
                  setProviderLogoPreview('');
                }}>
                  {language === 'so' ? 'Ka noqo' : 'Cancel'}
                </Button>
                <Button onClick={updateProvider} disabled={uploadingImage}>
                  {uploadingImage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {language === 'so' ? 'Badal' : 'Update'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Category Dialog */}
        {editingCategory && (
          <Dialog open={showCategoryEditDialog} onOpenChange={() => {
            setShowCategoryEditDialog(false);
            setEditingCategory(null);
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{language === 'so' ? 'Edit Category' : 'Edit Category'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                  <select
                    value={editingCategory.provider_id || ''}
                    onChange={(e) => setEditingCategory({ ...editingCategory, provider_id: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="">{language === 'so' ? 'Dooro Shirkad' : 'Select Provider'}</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.provider_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{language === 'so' ? 'Magaca Category' : 'Category Name'}</Label>
                  <Input
                    value={editingCategory.category_name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, category_name: e.target.value })}
                    placeholder={language === 'so' ? 'Tusaale: Daily, Weekly' : 'e.g. Daily, Weekly'}
                  />
                </div>
                <div>
                  <Label>{language === 'so' ? 'Tartib' : 'Display Order'}</Label>
                  <Input
                    type="number"
                    value={editingCategory.display_order}
                    onChange={(e) => setEditingCategory({ ...editingCategory, display_order: parseInt(e.target.value) })}
                  />
                </div>
                
                {/* Category Image Upload */}
                <div className="space-y-2">
                  <Label>{language === 'so' ? 'Sawirka Category' : 'Category Image (Optional)'}</Label>
                  {editingCategory.category_image && !categoryImagePreview && (
                    <div className="mb-2">
                      <img
                        src={editingCategory.category_image}
                        alt="Current"
                        className="h-20 w-20 object-contain border rounded"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === 'so' ? 'Sawirka hadda' : 'Current image'}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleCategoryImageSelect}
                      className="flex-1"
                    />
                    {categoryImagePreview && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearCategoryImageFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {categoryImagePreview && (
                    <div className="mt-2">
                      <img
                        src={categoryImagePreview}
                        alt="Preview"
                        className="h-20 w-20 object-contain border rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowCategoryEditDialog(false);
                  setEditingCategory(null);
                  clearCategoryImageFile();
                }}>
                  {language === 'so' ? 'Ka noqo' : 'Cancel'}
                </Button>
                <Button onClick={updateCategory} disabled={uploadingImage}>
                  {uploadingImage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {language === 'so' ? 'Badal' : 'Update'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* USSD Code Dialog */}
        <Dialog open={showUSSDDialog} onOpenChange={setShowUSSDDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center">
                {language === 'so' ? 'USSD Code Diyaar ah' : 'USSD Code Ready'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Order Details */}
              {currentOrder && (
                <div className="space-y-2 text-sm border-b pb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'so' ? 'Customer:' : 'Customer:'}</span>
                    <span className="font-medium">{currentOrder.customer_phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'so' ? 'Package:' : 'Package:'}</span>
                    <span className="font-medium">{currentOrder.package_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'so' ? 'Receiver:' : 'Receiver:'}</span>
                    <span className="font-medium">{currentOrder.receiver_phone}</span>
                  </div>
                </div>
              )}

              {/* USSD Code Display */}
              <div className="bg-muted rounded-lg p-6 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  {language === 'so' ? 'Code-ka USSD' : 'USSD Code'}
                </p>
                <p className="text-2xl md:text-3xl font-bold font-mono tracking-wider break-all">
                  {generatedUSSDCode}
                </p>
              </div>

              {/* Instructions */}
              <p className="text-xs text-center text-muted-foreground">
                {language === 'so' 
                  ? 'Copy code-ka oo gacanta ku dir marka aad dial gareento telefoonka' 
                  : 'Copy the code and dial it manually on your phone'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                onClick={copyUSSDCode} 
                variant="outline" 
                className="flex-1"
                size="lg"
              >
                <Copy className="h-4 w-4 mr-2" />
                {language === 'so' ? '📋 Copy Code' : '📋 Copy Code'}
              </Button>
              <Button 
                onClick={completeOrderAfterUSSD} 
                className="flex-1"
                size="lg"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {language === 'so' ? '✓ Dhameey' : '✓ Complete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick Template Code Edit Dialog */}
        <Dialog open={!!editingTemplateCode} onOpenChange={(open) => {
          if (!open) {
            setEditingTemplateCode(null);
            setQuickTemplateCode('');
          }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                {language === 'so' ? 'Badal Template Code' : 'Edit Template Code'}
              </DialogTitle>
            </DialogHeader>
            
            {editingTemplateCode && (
              <div className="space-y-4">
                {/* Package Info */}
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-sm font-medium">{editingTemplateCode.packageName}</p>
                  <p className="text-xs text-muted-foreground">
                    {editingTemplateCode.templateSource === 'package' && (language === 'so' ? 'Hadda waa Package-specific' : 'Currently: Package-specific')}
                    {editingTemplateCode.templateSource === 'category' && (language === 'so' ? 'Hadda waa Category code (waxaad samaysanaysaa package-specific)' : 'Currently: Category code (will create package-specific)')}
                    {editingTemplateCode.templateSource === 'provider' && (language === 'so' ? 'Hadda waa Provider-guud (waxaad samaysanaysaa package-specific)' : 'Currently: Provider default (will create package-specific)')}
                  </p>
                </div>

                {/* Current Code */}
                {editingTemplateCode.currentCode && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {language === 'so' ? 'Code-ka Hadda' : 'Current Code'}
                    </Label>
                    <code className="block text-xs bg-muted/50 px-3 py-2 rounded font-mono mt-1">
                      {editingTemplateCode.currentCode}
                    </code>
                  </div>
                )}

                {/* New Code Input */}
                <div>
                  <Label htmlFor="quickTemplateCode">
                    {language === 'so' ? 'Template Code Cusub' : 'New Template Code'}
                  </Label>
                  <Input
                    id="quickTemplateCode"
                    value={quickTemplateCode}
                    onChange={(e) => setQuickTemplateCode(e.target.value)}
                    placeholder="*737*{receiver_phone}*{cost_price}*{sim_password}#"
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === 'so' ? 'Variables: {receiver_phone}, {cost_price}, {sim_password}' : 'Variables: {receiver_phone}, {cost_price}, {sim_password}'}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingTemplateCode(null);
                  setQuickTemplateCode('');
                }}
              >
                {language === 'so' ? 'Ka noqo' : 'Cancel'}
              </Button>
              <Button onClick={saveQuickTemplateCode}>
                <Save className="h-4 w-4 mr-2" />
                {language === 'so' ? 'Kaydi' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Edit Payment Provider Dialog */}
        <Dialog open={!!editingPaymentProvider} onOpenChange={(open) => !open && setEditingPaymentProvider(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                {language === 'so' ? 'Badal Payment Provider' : 'Edit Payment Provider'}
                {editingPaymentProvider && ` - ${editingPaymentProvider.provider_name}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{language === 'so' ? 'Lambarka (Payment Number)' : 'Payment Number'}</Label>
                <Input value={editPaymentNumber} onChange={(e) => setEditPaymentNumber(e.target.value)} placeholder="617195659" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Prefix Code</Label>
                <Input value={editPrefixCode} onChange={(e) => setEditPrefixCode(e.target.value)} placeholder="*712*" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>USSD Code Template</Label>
                <Input value={editUssdTemplate} onChange={(e) => setEditUssdTemplate(e.target.value)} placeholder="*712*{phone}*{amount}#" className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Commission Rate (%)</Label>
                <Input type="number" value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} placeholder="0" className="mt-1" step="0.1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPaymentProvider(null)}>
                {language === 'so' ? 'Ka noqo' : 'Cancel'}
              </Button>
              <Button onClick={updatePaymentProvider}>
                <Save className="h-4 w-4 mr-2" />
                {language === 'so' ? 'Kaydi' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI Chat Floating Button */}
        <AdminAIChat />
    </SidebarProvider>
  );
};

export default AdminDashboard;
