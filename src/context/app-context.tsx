import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

import {
  isLanguageCode,
  LANGUAGE_STORAGE_KEY,
  translate,
  type LanguageCode,
} from '@/i18n';
import {
  ACTIVE_ORDER_STATUSES,
  mapCoupon,
  mapOrder,
  mapPickupSlot,
  mapService,
  mapSettings,
} from '@/lib/domain';
import { normalizeOrderStatus, workflowProgress } from '@/lib/order-workflow';
import {
  calculateCouponDiscount,
  customerErrorCode,
  EMPTY_CUSTOMER_ELIGIBILITY,
  normalizeThaiPhone,
  type CustomerEligibility,
} from '@/lib/customer-rules';
import { isAdminWebRoute, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { HOSTED_PASSWORD_RESET_URL, passwordRecoveryTokens } from '@/lib/password-recovery';
import type {
  Address,
  AppNotification,
  BusinessSettings,
  Coupon,
  CustomerOrder,
  LaundryService,
  PaymentMethod,
  PickupSlot,
  PlaceOrderInput,
  Profile,
  UserRole,
} from '@/types/domain';

export type { Address, CustomerOrder, OrderStatus, PlaceOrderInput } from '@/types/domain';

type AuthResult = {
  error?: string;
  needsEmailConfirmation?: boolean;
};

type NotificationPreferences = {
  orderUpdates: boolean;
  pickupReminders: boolean;
  promotions: boolean;
};

type AppContextValue = {
  profile: Profile;
  updateProfile: (nextProfile: Pick<Profile, 'name' | 'email' | 'phone'>) => Promise<void>;
  addresses: Address[];
  primaryAddressId: string;
  primaryAddress: Address;
  addAddress: (address: Omit<Address, 'id' | 'isPrimary'>) => Promise<Address>;
  setPrimaryAddressId: (id: string) => Promise<void>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => Promise<void>;
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
  notificationPreferences: NotificationPreferences;
  setNotificationPreference: (key: keyof NotificationPreferences, value: boolean) => Promise<void>;
  notifications: AppNotification[];
  unreadNotifications: AppNotification[];
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  services: LaundryService[];
  coupons: Coupon[];
  couponLoading: boolean;
  couponError: string | null;
  pickupSlots: PickupSlot[];
  businessSettings: BusinessSettings;
  customerEligibility: CustomerEligibility;
  supabaseConfigured: boolean;
  authLoading: boolean;
  passwordRecoveryActive: boolean;
  dataLoading: boolean;
  dataError: string | null;
  userId: string | null;
  userRole: UserRole | null;
  isDemo: boolean;
  orders: CustomerOrder[];
  activeOrder: CustomerOrder | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string, phone?: string) => Promise<AuthResult>;
  continueDemo: () => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  placeOrder: (order: PlaceOrderInput) => Promise<{ databaseId: string; id: string; amount: number }>;
  withdrawOrder: (orderId: string) => Promise<void>;
  respondToPrice: (orderId: string, approve: boolean, note?: string) => Promise<void>;
  beginPromptPayAttempt: (orderId: string, retry?: boolean) => Promise<void>;
  requestPromptPayConfirmation: (orderId: string) => Promise<void>;
  changeOrderPaymentMethod: (orderId: string, method: PaymentMethod) => Promise<void>;
  sendOrderMessage: (orderId: string, message: string) => Promise<void>;
  uploadOrderFile: (
    orderId: string,
    fileType: 'laundry_photo' | 'stain_photo' | 'payment_slip',
    selectedAsset?: { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number },
  ) => Promise<void>;
  refresh: () => Promise<void>;
  refreshCoupons: (force?: boolean) => Promise<void>;
};

const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
  normalizedPhone: null,
  phoneVerifiedAt: null,
  role: 'customer',
  language: 'en',
  defaultPaymentMethod: 'cash_delivery',
  defaultPreferences: {},
  isDemo: false,
};

const EMPTY_ADDRESS: Address = {
  id: '',
  label: 'No address saved',
  detail: 'Add a pickup address',
  isPrimary: false,
};

const DEMO_SESSION_KEY = '@supershine/local-demo-v2';
const DEMO_USAGE_KEY = '@supershine/local-demo-coupons-v2';
const DEMO_ORDERS_KEY = '@supershine/local-demo-orders-v20';
const DEMO_PROFILE: Profile = { ...EMPTY_PROFILE, name: 'Demo Customer', role: 'customer', isDemo: true };
const DEMO_ADDRESS: Address = { id: 'demo-address', label: 'Home', detail: '88 Sukhumvit Road, Bangkok', isPrimary: true };
const DEMO_COUPONS: Coupon[] = [
  { code: 'FRESH20', title: 'Welcome offer', description: 'Save 20% on a demo order.', discountTarget: 'service', discountType: 'percentage', discountValue: 20, maxDiscount: null, minimumOrder: 200, perCustomerLimit: 1, totalUsageLimit: null, usageCount: 0, serviceId: null, eligibleServiceIds: [], requiresVerifiedPhone: false, firstVerifiedProfileOnly: false, active: true },
  { code: 'DEMO50', title: 'Demo laundry credit', description: 'Save ฿50 in demo checkout.', discountTarget: 'service', discountType: 'fixed_amount', discountValue: 50, maxDiscount: null, minimumOrder: 250, perCustomerLimit: 2, totalUsageLimit: null, usageCount: 0, serviceId: null, eligibleServiceIds: [], requiresVerifiedPhone: false, firstVerifiedProfileOnly: false, active: true },
];

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  pickupReminders: true,
  promotions: false,
};

const AppContext = createContext<AppContextValue | null>(null);

const ORDER_SELECT = `
  *,
  profiles:user_id(full_name,email,phone),
  order_items(*),
  order_status_history(*),
  payments(*),
  support_messages(*)
`;

function normalizeError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'UNKNOWN_ERROR';
  const normalized = message.toLowerCase();
  const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : 0;
  if (code === 'captcha_failed' || normalized.includes('captcha_failed') || normalized.includes('captcha verification process failed')) return 'AUTH_CAPTCHA_FAILED';
  if (normalized.includes('invalid login credentials')) return 'AUTH_INVALID_CREDENTIALS';
  if (normalized.includes('email not confirmed')) return 'AUTH_EMAIL_NOT_CONFIRMED';
  if (message.includes('User already registered')) return 'AUTH_EMAIL_EXISTS';
  if (message.includes('Password should be')) return 'AUTH_PASSWORD_TOO_SHORT';
  if (message.includes('PROFILE_LOAD_FAILED')) return 'PROFILE_LOAD_FAILED';
  if (status === 429 || code.includes('rate_limit') || normalized.includes('too many requests')) return 'AUTH_TOO_MANY_ATTEMPTS';
  if (normalized.includes('failed to fetch') || normalized.includes('network request failed') || normalized.includes('fetch failed')) return 'AUTH_NETWORK_ERROR';
  return customerErrorCode(message);
}

function sanitizedErrorMetadata(error: unknown) {
  const normalizedCode = normalizeError(error);
  const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : 0;
  return { code: normalizedCode, status };
}

function createLocalDemoId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function logRealtimeState(scope: string, status: string, error?: unknown) {
  if (!__DEV__) return;
  const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;
  const details = { scope, status, code };
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('realtime_channel_state', details);
  else console.info('realtime_channel_state', details);
}

async function prepareRealtimeChannel(name: string) {
  if (!supabase) return null;
  const topic = `realtime:${name}`;
  const existing = supabase.getChannels().find((channel) => channel.topic === topic);
  if (existing) await supabase.removeChannel(existing);
  return supabase.channel(name);
}

function patchOrderFromRealtime(order: CustomerOrder, row: Record<string, unknown>) {
  const status = row.status ? normalizeOrderStatus(row.status, order.returnMethod) : order.status;
  const estimatedTotal = row.estimated_total == null ? order.estimatedTotal : Number(row.estimated_total);
  const finalTotal = Object.prototype.hasOwnProperty.call(row, 'final_total')
    ? row.final_total == null ? null : Number(row.final_total)
    : order.finalTotal;
  return {
    ...order,
    status,
    progress: workflowProgress(status, order.collectionMethod, order.returnMethod),
    paymentStatus: typeof row.payment_status === 'string'
      ? row.payment_status === 'waiting_verification' ? 'pending'
        : row.payment_status === 'verified' ? 'paid'
          : row.payment_status === 'rejected' ? 'failed'
            : row.payment_status === 'outstanding' ? 'unpaid'
              : row.payment_status as CustomerOrder['paymentStatus']
      : order.paymentStatus,
    priceApprovalStatus: typeof row.price_approval_status === 'string' ? row.price_approval_status as CustomerOrder['priceApprovalStatus'] : order.priceApprovalStatus,
    estimatedTotal,
    finalTotal,
    amount: finalTotal ?? estimatedTotal,
    pickupDate: typeof row.pickup_date === 'string' ? row.pickup_date : order.pickupDate,
    pickupStart: typeof row.pickup_start === 'string' ? row.pickup_start : order.pickupStart,
    pickupEnd: typeof row.pickup_end === 'string' ? row.pickup_end : order.pickupEnd,
    pickupSlot: typeof row.pickup_slot === 'string' ? row.pickup_slot : order.pickupSlot,
    pickupSlotId: typeof row.pickup_slot_id === 'string' ? row.pickup_slot_id : order.pickupSlotId,
    expectedArrivalAt: typeof row.expected_arrival_at === 'string' || row.expected_arrival_at === null ? row.expected_arrival_at : order.expectedArrivalAt,
    deliveryEta: typeof row.delivery_eta === 'string' || row.delivery_eta === null ? row.delivery_eta : order.deliveryEta,
    eta: typeof row.delivery_eta === 'string' ? row.delivery_eta : typeof row.expected_arrival_at === 'string' ? row.expected_arrival_at : order.eta,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : order.updatedAt,
  };
}

function mapNotification(row: Record<string, any>): AppNotification {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type || 'order_update',
    title: row.title,
    message: row.body,
    titleKey: row.title_key,
    messageKey: row.message_key,
    messageParams: row.message_params || {},
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [primaryAddressId, setPrimaryAddressIdState] = useState('');
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethod>('cash_delivery');
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const languageRef = useRef<LanguageCode>('en');
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [catalogCoupons, setCatalogCoupons] = useState<Coupon[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const couponRequestRef = useRef<Promise<void> | null>(null);
  const couponRpcMissingRef = useRef(false);
  const couponWarningShownRef = useRef(false);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(mapSettings());
  const [customerEligibility, setCustomerEligibility] = useState<CustomerEligibility>(EMPTY_CUSTOMER_ELIGIBILITY);
  const [demoCouponUsage, setDemoCouponUsage] = useState<Record<string, number>>({});
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const ordersRevisionRef = useRef(0);
  const orderRefreshVersionRef = useRef<Record<string, number>>({});
  const catalogRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const couponRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderRefreshTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const messageSubmissionRef = useRef(new Set<string>());
  const paymentSubmissionRef = useRef(new Set<string>());
  const demoModeRef = useRef(false);

  const t = useCallback(
    (key: string, variables?: Record<string, string | number>) => translate(language, key, variables),
    [language],
  );

  const loadCatalog = useCallback(async () => {
    if (!supabase) {
      setDataError('SUPABASE_NOT_CONFIGURED');
      setDataLoading(false);
      return;
    }
    const [servicesResult, slotsResult, settingsResult] = await Promise.all([
      supabase.from('services').select('*, service_options(*)').order('sort_order'),
      supabase.from('pickup_slots').select('*').eq('enabled', true).order('slot_date').order('start_time'),
      supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    const firstError = servicesResult.error || slotsResult.error || settingsResult.error;
    if (firstError) throw new Error(firstError.message.includes('does not exist')
      ? 'V1_1_MIGRATION_REQUIRED'
      : firstError.message);
    setServices((servicesResult.data || []).map((row) => mapService(row)).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    }));
    setPickupSlots((slotsResult.data || []).map((row) => mapPickupSlot(row)));
    setBusinessSettings(mapSettings(settingsResult.data));
  }, []);

  const loadLegacyCoupons = useCallback(async (accountId: string) => {
    if (!supabase) return false;
    const [couponsResult, usageResult] = await Promise.all([
      supabase.from('coupons').select('*').eq('active', true),
      supabase.from('coupon_usage').select('coupon_code').eq('user_id', accountId),
    ]);
    if (couponsResult.error || usageResult.error) return false;
    const usageCounts = (usageResult.data || []).reduce<Record<string, number>>((counts, row) => {
      counts[row.coupon_code] = (counts[row.coupon_code] || 0) + 1;
      return counts;
    }, {});
    const now = Date.now();
    setCatalogCoupons((couponsResult.data || [])
      .map((row) => mapCoupon(row))
      .filter((coupon) => (!coupon.startsAt || new Date(coupon.startsAt).getTime() <= now)
        && (!coupon.expiresAt || new Date(coupon.expiresAt).getTime() > now)
        && (coupon.totalUsageLimit == null || coupon.usageCount < coupon.totalUsageLimit)
        && (coupon.perCustomerLimit == null || (usageCounts[coupon.code] || 0) < coupon.perCustomerLimit))
      .sort((a, b) => a.code.localeCompare(b.code)));
    setCouponError(null);
    return true;
  }, []);

  const loadCoupons = useCallback((accountId = userId, force = false) => {
    if (demoModeRef.current) { setCouponError(null); setCouponLoading(false); return Promise.resolve(); }
    if (!supabase || !accountId) { setCatalogCoupons([]); setCouponError(null); setCouponLoading(false); return Promise.resolve(); }
    if (couponRequestRef.current) return couponRequestRef.current;
    const request = (async () => {
      setCouponLoading(true);
      setCouponError(null);
      if (!force && couponRpcMissingRef.current) {
        const loaded = await loadLegacyCoupons(accountId);
        setCouponLoading(false);
        if (!loaded) setCouponError('COUPON_LOAD_FAILED');
        return;
      }
      const result = await supabase.rpc('get_eligible_coupons_v15');
      if (result.error?.code === 'PGRST202' && await loadLegacyCoupons(accountId)) {
        couponRpcMissingRef.current = true;
        setCouponLoading(false);
        return;
      }
      setCouponLoading(false);
      if (result.error) {
        setCouponError('COUPON_LOAD_FAILED');
        couponRpcMissingRef.current = result.error.code === 'PGRST202';
        if (__DEV__ && !couponWarningShownRef.current) {
          couponWarningShownRef.current = true;
          console.warn('coupon_load_failed', { code: result.error.code || 'UNKNOWN', status: result.status || 0 });
        }
        return;
      }
      couponRpcMissingRef.current = false;
      couponWarningShownRef.current = false;
      setCatalogCoupons(((result.data || []) as Record<string, unknown>[])
        .map((row) => mapCoupon(row))
        .sort((a, b) => a.code.localeCompare(b.code)));
    })();
    couponRequestRef.current = request;
    void request.finally(() => { if (couponRequestRef.current === request) couponRequestRef.current = null; });
    return request;
  }, [loadLegacyCoupons, userId]);

  const refreshCoupons = useCallback((force = false) => loadCoupons(userId, force), [loadCoupons, userId]);

  const loadAccount = useCallback(async (nextUserId: string) => {
    if (!supabase) return;
    const ordersRevision = ordersRevisionRef.current;
    const profileResult = await supabase.from('profiles').select('*').eq('id', nextUserId).maybeSingle();
    if (profileResult.error) {
      if (__DEV__) console.warn('account_profile_load_failed', sanitizedErrorMetadata(profileResult.error));
      throw new Error('PROFILE_LOAD_FAILED');
    }
    if (!profileResult.data) throw new Error('PROFILE_LOAD_FAILED');

    const row = profileResult.data;
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    const nextLanguage = isLanguageCode(savedLanguage)
      ? savedLanguage
      : isLanguageCode(row.language) ? row.language : 'en';
    setLanguageState(nextLanguage);
    languageRef.current = nextLanguage;
    if (row.language !== nextLanguage) {
      void supabase.from('profiles').update({ language: nextLanguage }).eq('id', nextUserId);
    }
    const preferences = row.default_preferences || {};
    setProfile({
      id: row.id,
      name: row.full_name || '',
      email: row.email || '',
      phone: row.phone || '',
      normalizedPhone: row.normalized_phone,
      phoneVerifiedAt: row.phone_verified_at,
      role: row.role || 'customer',
      language: nextLanguage,
      avatarPath: row.avatar_path,
      defaultPaymentMethod: row.default_payment_method === 'cash' ? 'cash_delivery' : row.default_payment_method,
      defaultPreferences: preferences,
      isDemo: Boolean(row.is_demo),
    });
    setPaymentMethodState(row.default_payment_method === 'cash' ? 'cash_delivery' : row.default_payment_method || 'cash_delivery');
    setNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(preferences.notifications || {}),
    });

    if (row.role === 'admin' || row.role === 'driver') {
      setAddresses([]);
      setPrimaryAddressIdState('');
      setOrders([]);
      setCustomerEligibility(EMPTY_CUSTOMER_ELIGIBILITY);
      return;
    }

    const [addressesResult, ordersResult, notificationsResult] = await Promise.all([
      supabase.from('addresses').select('*').eq('user_id', nextUserId).order('is_primary', { ascending: false }),
      supabase.from('orders').select(ORDER_SELECT).eq('user_id', nextUserId).eq('is_demo', false).order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('user_id', nextUserId).order('created_at', { ascending: false }),
    ]);
    const firstError = addressesResult.error || ordersResult.error || notificationsResult.error;
    if (firstError) {
      if (__DEV__) console.warn('account_data_load_failed', sanitizedErrorMetadata(firstError));
      throw new Error('PROFILE_LOAD_FAILED');
    }

    const benefitResult = await supabase.from('profile_pickup_benefit_usage').select('id').eq('user_id', nextUserId).is('restored_at', null);
    setCustomerEligibility({ ...EMPTY_CUSTOMER_ELIGIBILITY, remainingFreePickups: benefitResult.error ? 0 : Math.max(0, 5 - (benefitResult.data || []).length) });

    const nextAddresses = (addressesResult.data || []).map((row) => ({
      id: row.id,
      label: row.label,
      detail: row.address_line,
      isPrimary: row.is_primary,
    }));
    setAddresses(nextAddresses);
    setPrimaryAddressIdState(nextAddresses.find((address) => address.isPrimary)?.id || nextAddresses[0]?.id || '');
    if (ordersRevisionRef.current === ordersRevision) setOrders((ordersResult.data || []).map((row) => mapOrder(row)));
    setNotifications((notificationsResult.data || []).map((row) => mapNotification(row)));
  }, []);

  const loadNotifications = useCallback(async (accountId: string) => {
    if (!supabase) return;
    const result = await supabase.from('notifications').select('*')
      .eq('user_id', accountId).order('created_at', { ascending: false });
    if (result.error) {
      if (__DEV__) console.warn('notification_realtime_refresh_failed', { code: result.error.code || 'UNKNOWN', status: result.status || 0 });
      return;
    }
    setNotifications((result.data || []).map((row) => mapNotification(row)));
  }, []);

  const loadOrders = useCallback(async (accountId: string) => {
    if (!supabase) return;
    const ordersRevision = ordersRevisionRef.current;
    const result = await supabase.from('orders').select(ORDER_SELECT)
      .eq('user_id', accountId).eq('is_demo', demoModeRef.current).order('created_at', { ascending: false });
    if (result.error) {
      if (__DEV__) console.warn('orders_realtime_refresh_failed', { code: result.error.code || 'UNKNOWN', status: result.status || 0 });
      return;
    }
    if (ordersRevisionRef.current === ordersRevision) setOrders((result.data || []).map((row) => mapOrder(row)));
  }, []);

  const loadOrder = useCallback(async (accountId: string, orderId: string) => {
    if (!supabase || !orderId) return;
    const requestVersion = (orderRefreshVersionRef.current[orderId] || 0) + 1;
    orderRefreshVersionRef.current[orderId] = requestVersion;
    const result = await supabase.from('orders').select(ORDER_SELECT)
      .eq('id', orderId).eq('user_id', accountId).eq('is_demo', demoModeRef.current).maybeSingle();
    if (orderRefreshVersionRef.current[orderId] !== requestVersion) return;
    if (result.error) {
      if (__DEV__) console.warn('order_realtime_refresh_failed', { code: result.error.code || 'UNKNOWN', status: result.status || 0 });
      return;
    }
    setOrders((current) => {
      if (!result.data) return current.filter((order) => order.databaseId !== orderId);
      const nextOrder = mapOrder(result.data);
      const remaining = current.filter((order) => order.databaseId !== orderId);
      return [nextOrder, ...remaining].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  const scheduleCatalogRefresh = useCallback(() => {
    if (catalogRefreshTimerRef.current) clearTimeout(catalogRefreshTimerRef.current);
    catalogRefreshTimerRef.current = setTimeout(() => {
      catalogRefreshTimerRef.current = null;
      void loadCatalog().catch((error) => {
        if (__DEV__) console.warn('catalog_realtime_refresh_failed', { code: normalizeError(error) });
      });
    }, 80);
  }, [loadCatalog]);

  const scheduleCouponRefresh = useCallback((accountId: string) => {
    if (couponRefreshTimerRef.current) clearTimeout(couponRefreshTimerRef.current);
    const run = () => {
      if (couponRequestRef.current) {
        couponRefreshTimerRef.current = setTimeout(run, 80);
        return;
      }
      couponRefreshTimerRef.current = null;
      void loadCoupons(accountId);
    };
    couponRefreshTimerRef.current = setTimeout(run, 80);
  }, [loadCoupons]);

  const scheduleNotificationRefresh = useCallback((accountId: string) => {
    if (notificationRefreshTimerRef.current) clearTimeout(notificationRefreshTimerRef.current);
    notificationRefreshTimerRef.current = setTimeout(() => {
      notificationRefreshTimerRef.current = null;
      void loadNotifications(accountId);
    }, 80);
  }, [loadNotifications]);

  const scheduleOrderRefresh = useCallback((accountId: string, orderId?: string) => {
    const key = orderId || '__all__';
    if (orderRefreshTimersRef.current[key]) clearTimeout(orderRefreshTimersRef.current[key]);
    orderRefreshTimersRef.current[key] = setTimeout(() => {
      delete orderRefreshTimersRef.current[key];
      if (orderId) void loadOrder(accountId, orderId);
      else void loadOrders(accountId);
    }, 80);
  }, [loadOrder, loadOrders]);

  const enterDemo = useCallback(async (accountId: string) => {
    let usage: Record<string, number> = {};
    let storedOrders: CustomerOrder[] = [];
    try { usage = JSON.parse(await AsyncStorage.getItem(DEMO_USAGE_KEY) || '{}'); } catch { usage = {}; }
    try {
      const parsed = JSON.parse(await AsyncStorage.getItem(DEMO_ORDERS_KEY) || '[]');
      storedOrders = Array.isArray(parsed) ? parsed.filter((order): order is CustomerOrder => Boolean(order?.isDemo)) : [];
    } catch { storedOrders = []; }
    demoModeRef.current = true;
    setUserId(accountId);
    setProfile({ ...DEMO_PROFILE, id: accountId, language: languageRef.current });
    setAddresses([DEMO_ADDRESS]);
    setPrimaryAddressIdState(DEMO_ADDRESS.id);
    setPaymentMethodState('cash_delivery');
    setOrders(storedOrders);
    setNotifications([]);
    setDemoCouponUsage(usage);
    setCustomerEligibility(EMPTY_CUSTOMER_ELIGIBILITY);
    setCouponError(null);
    setDataError(null);
  }, []);

  const refresh = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      await loadCatalog();
      if (userId && !demoModeRef.current) await Promise.all([loadAccount(userId), loadCoupons(userId)]);
    } catch (error) {
      setDataError(normalizeError(error));
    } finally {
      setDataLoading(false);
    }
  }, [loadAccount, loadCatalog, loadCoupons, userId]);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((savedLanguage) => {
        if (isLanguageCode(savedLanguage)) {
          setLanguageState(savedLanguage);
          languageRef.current = savedLanguage;
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    void loadCatalog().catch((error) => setDataError(normalizeError(error))).finally(() => setDataLoading(false));
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (demoModeRef.current) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryActive(true);
      else if (event === 'SIGNED_OUT') setPasswordRecoveryActive(false);
      demoModeRef.current = false;
      const nextUserId = session?.user.is_anonymous ? null : session?.user.id ?? null;
      setUserId(nextUserId);
      setDataError(null);
      setAuthLoading(Boolean(nextUserId));
      if (nextUserId) setTimeout(() => void Promise.all([loadAccount(nextUserId), loadCoupons(nextUserId)])
        .catch((error) => setDataError(normalizeError(error)))
        .finally(() => setAuthLoading(false)), 0);
      else { setCatalogCoupons([]); setCouponError(null); setAuthLoading(false); }
    });
    void (async () => {
      const savedDemo = isAdminWebRoute ? null : await AsyncStorage.getItem(DEMO_SESSION_KEY);
      if (!mounted) return;
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) setDataError(normalizeError(error));
      if (savedDemo) {
        await enterDemo(savedDemo);
      } else {
        const nextUserId = data.session?.user.is_anonymous ? null : data.session?.user.id ?? null;
        setUserId(nextUserId);
        if (nextUserId) try { await Promise.all([loadAccount(nextUserId), loadCoupons(nextUserId)]); } catch (loadError) { setDataError(normalizeError(loadError)); }
      }
      if (mounted) setAuthLoading(false);
    })().catch((error) => setDataError(normalizeError(error))).finally(() => { if (mounted) setAuthLoading(false); });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [enterDemo, loadAccount, loadCatalog, loadCoupons]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    const supabaseClient = supabase;
    let cancelled = false;
    const importRecoverySession = async (url: string | null) => {
      if (!url) return;
      const recovery = passwordRecoveryTokens(url);
      if (!recovery.isRecovery) return;
      if (!recovery.accessToken || !recovery.refreshToken) {
        setPasswordRecoveryActive(false);
        return;
      }
      const { error } = await supabaseClient.auth.setSession({
        access_token: recovery.accessToken,
        refresh_token: recovery.refreshToken,
      });
      if (error && !cancelled) {
        setPasswordRecoveryActive(false);
        if (__DEV__) console.warn('password_recovery_session_failed', sanitizedErrorMetadata(error));
      } else if (!cancelled) setPasswordRecoveryActive(true);
    };
    void Linking.getInitialURL().then(importRecoverySession);
    const subscription = Linking.addEventListener('url', ({ url }) => { void importRecoverySession(url); });
    return () => { cancelled = true; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!supabase || authLoading) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const handleCatalogChange = () => scheduleCatalogRefresh();
    const handlePublicRevision = () => {
      scheduleCatalogRefresh();
      if (userId && !profile.isDemo) scheduleCouponRefresh(userId);
    };
    void prepareRealtimeChannel('customer-public-catalog').then((nextChannel) => {
      if (!nextChannel) return;
      if (cancelled) return void supabase?.removeChannel(nextChannel);
      channel = nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, handleCatalogChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_options' }, handleCatalogChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_slots' }, handleCatalogChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, handlePublicRevision)
        .subscribe((status, error) => {
          logRealtimeState('public-catalog', status, error);
          if (status === 'SUBSCRIBED') handlePublicRevision();
        });
    });
    return () => {
      cancelled = true;
      if (catalogRefreshTimerRef.current) clearTimeout(catalogRefreshTimerRef.current);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [authLoading, profile.isDemo, scheduleCatalogRefresh, scheduleCouponRefresh, userId]);

  useEffect(() => {
    if (!supabase || authLoading || !userId || profile.isDemo) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const handlePromotionChange = () => scheduleCouponRefresh(userId);
    void prepareRealtimeChannel('customer-promotions').then((nextChannel) => {
      if (!nextChannel) return;
      if (cancelled) return void supabase?.removeChannel(nextChannel);
      channel = nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, handlePromotionChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coupon_usage', filter: `user_id=eq.${userId}` }, handlePromotionChange)
        .subscribe((status, error) => {
          logRealtimeState('promotions', status, error);
          if (status === 'SUBSCRIBED') handlePromotionChange();
        });
    });
    return () => {
      cancelled = true;
      if (couponRefreshTimerRef.current) clearTimeout(couponRefreshTimerRef.current);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [authLoading, profile.isDemo, scheduleCouponRefresh, userId]);

  useEffect(() => {
    if (!supabase || authLoading || !userId || profile.isDemo) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const refreshChangedOrder = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) || {};
      const orderId = typeof row.id === 'string' ? row.id : '';
      if (!orderId) return scheduleOrderRefresh(userId);
      ordersRevisionRef.current += 1;
      if (payload.eventType === 'DELETE') {
        setOrders((current) => current.filter((order) => order.databaseId !== orderId));
        return;
      }
      setOrders((current) => current.map((order) => order.databaseId === orderId ? patchOrderFromRealtime(order, row) : order));
      scheduleOrderRefresh(userId, orderId);
    };
    const refreshRelatedOrder = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      const orderId = typeof row?.order_id === 'string' ? row.order_id : '';
      ordersRevisionRef.current += 1;
      scheduleOrderRefresh(userId, orderId || undefined);
    };
    void prepareRealtimeChannel('customer-orders').then((nextChannel) => {
      if (!nextChannel) return;
      if (cancelled) return void supabase?.removeChannel(nextChannel);
      channel = nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, refreshChangedOrder)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refreshRelatedOrder)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, refreshRelatedOrder)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${userId}` }, refreshRelatedOrder)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages', filter: `user_id=eq.${userId}` }, refreshRelatedOrder)
        .subscribe((status, error) => {
          logRealtimeState('orders', status, error);
          if (status === 'SUBSCRIBED') scheduleOrderRefresh(userId);
        });
    });
    return () => {
      cancelled = true;
      Object.values(orderRefreshTimersRef.current).forEach(clearTimeout);
      orderRefreshTimersRef.current = {};
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [authLoading, profile.isDemo, scheduleOrderRefresh, userId]);

  useEffect(() => {
    if (!supabase || authLoading || !userId || profile.isDemo) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const handleNotificationChange = () => scheduleNotificationRefresh(userId);
    void prepareRealtimeChannel('customer-notifications').then((nextChannel) => {
      if (!nextChannel) return;
      if (cancelled) return void supabase?.removeChannel(nextChannel);
      channel = nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, handleNotificationChange)
        .subscribe((status, error) => {
          logRealtimeState('notifications', status, error);
          if (status === 'SUBSCRIBED') handleNotificationChange();
        });
    });
    return () => {
      cancelled = true;
      if (notificationRefreshTimerRef.current) clearTimeout(notificationRefreshTimerRef.current);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [authLoading, profile.isDemo, scheduleNotificationRefresh, userId]);

  useEffect(() => {
    if (!supabase || authLoading) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (profile.isDemo) {
        scheduleCatalogRefresh();
        return;
      }
      void supabase!.auth.getSession().then(({ data, error }) => {
        if (error) {
          if (__DEV__) console.warn('foreground_session_check_failed', { code: normalizeError(error) });
          return;
        }
        scheduleCatalogRefresh();
        if (userId && data.session?.user.id === userId) {
          if (!profile.isDemo) scheduleCouponRefresh(userId);
          scheduleOrderRefresh(userId);
          scheduleNotificationRefresh(userId);
        }
      });
    });
    return () => subscription.remove();
  }, [authLoading, profile.isDemo, scheduleCatalogRefresh, scheduleCouponRefresh, scheduleNotificationRefresh, scheduleOrderRefresh, userId]);

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    languageRef.current = nextLanguage;
    setProfile((current) => ({ ...current, language: nextLanguage }));
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    if (supabase && userId && !profile.isDemo) void supabase.from('profiles').update({ language: nextLanguage }).eq('id', userId);
  }, [profile.isDemo, userId]);

  const updateProfile = useCallback(async (nextProfile: Pick<Profile, 'name' | 'email' | 'phone'>) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    const normalizedPhone = nextProfile.phone.trim() ? normalizeThaiPhone(nextProfile.phone) : '';
    if (nextProfile.phone.trim() && !normalizedPhone) throw new Error('PHONE_INVALID');
    const updated = { ...nextProfile, phone: normalizedPhone || '' };
    if (profile.isDemo) { setProfile((current) => ({ ...current, ...updated })); return; }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.from('profiles').update({
      full_name: updated.name,
      email: updated.email,
      phone: updated.phone,
    }).eq('id', userId);
    if (error) throw new Error(normalizeError(error));
    setProfile((current) => ({ ...current, ...updated }));
  }, [profile.isDemo, userId]);

  const addAddress = useCallback(async (address: Omit<Address, 'id' | 'isPrimary'>) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    const makePrimary = addresses.length === 0;
    if (profile.isDemo) {
      const nextAddress = { ...address, id: `demo-address-${Date.now()}`, isPrimary: makePrimary };
      setAddresses((current) => [...current, nextAddress]);
      if (makePrimary) setPrimaryAddressIdState(nextAddress.id);
      return nextAddress;
    }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.from('addresses').insert({
      user_id: userId,
      label: address.label,
      address_line: address.detail,
      is_primary: makePrimary,
    }).select('*').single();
    if (error) throw new Error(normalizeError(error));
    const nextAddress = { id: data.id, label: data.label, detail: data.address_line, isPrimary: data.is_primary };
    setAddresses((current) => [...current, nextAddress]);
    if (makePrimary) setPrimaryAddressIdState(nextAddress.id);
    return nextAddress;
  }, [addresses.length, profile.isDemo, userId]);

  const setPrimaryAddressId = useCallback(async (id: string) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    if (profile.isDemo) {
      setPrimaryAddressIdState(id);
      setAddresses((current) => current.map((address) => ({ ...address, isPrimary: address.id === id })));
      return;
    }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error: clearError } = await supabase.from('addresses').update({ is_primary: false }).eq('user_id', userId);
    if (clearError) throw new Error(normalizeError(clearError));
    const { error } = await supabase.from('addresses').update({ is_primary: true }).eq('id', id).eq('user_id', userId);
    if (error) throw new Error(normalizeError(error));
    setPrimaryAddressIdState(id);
    setAddresses((current) => current.map((address) => ({ ...address, isPrimary: address.id === id })));
  }, [profile.isDemo, userId]);

  const setPaymentMethod = useCallback(async (method: PaymentMethod) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    if (profile.isDemo) { setPaymentMethodState(method); setProfile((current) => ({ ...current, defaultPaymentMethod: method })); return; }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.from('profiles').update({ default_payment_method: method }).eq('id', userId);
    if (error) throw new Error(normalizeError(error));
    setPaymentMethodState(method);
    setProfile((current) => ({ ...current, defaultPaymentMethod: method }));
  }, [profile.isDemo, userId]);

  const setNotificationPreference = useCallback(async (key: keyof NotificationPreferences, enabled: boolean) => {
    const next = { ...notificationPreferences, [key]: enabled };
    setNotificationPreferences(next);
    if (!supabase || !userId || profile.isDemo) return;
    const nextPreferences = { ...profile.defaultPreferences, notifications: next };
    const { error } = await supabase.from('profiles').update({ default_preferences: nextPreferences }).eq('id', userId);
    if (error) throw new Error(normalizeError(error));
    setProfile((current) => ({ ...current, defaultPreferences: nextPreferences }));
  }, [notificationPreferences, profile.defaultPreferences, profile.isDemo, userId]);

  const markNotificationRead = useCallback(async (id: string) => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    if (!supabase) return;
    const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', id).eq('user_id', userId);
    if (error) throw new Error(normalizeError(error));
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt } : item));
  }, [userId]);

  const markAllNotificationsRead = useCallback(async () => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    if (!supabase) return;
    const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('user_id', userId).is('read_at', null);
    if (error) throw new Error(normalizeError(error));
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED' };
    setDataError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (__DEV__) console.warn('customer_sign_in_failed', sanitizedErrorMetadata(error));
        return { error: normalizeError(error) };
      }
      demoModeRef.current = false;
      await AsyncStorage.multiRemove([DEMO_SESSION_KEY, DEMO_USAGE_KEY, DEMO_ORDERS_KEY]);
      return {};
    } catch (error) {
      if (__DEV__) console.warn('customer_sign_in_failed', sanitizedErrorMetadata(error));
      return { error: normalizeError(error) };
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, phone = ''): Promise<AuthResult> => {
    if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED' };
    const normalizedPhone = normalizeThaiPhone(phone);
    if (!normalizedPhone) return { error: 'PHONE_INVALID' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim(), phone: normalizedPhone } },
    });
    if (error) return { error: normalizeError(error) };
    return { needsEmailConfirmation: !data.session };
  }, []);

  const continueDemo = useCallback(async (): Promise<AuthResult> => {
    try {
      const existingId = await AsyncStorage.getItem(DEMO_SESSION_KEY);
      const demoSessionId = existingId || createLocalDemoId('local-demo');
      await AsyncStorage.setItem(DEMO_SESSION_KEY, demoSessionId);
      await enterDemo(demoSessionId);
      return {};
    } catch (error) {
      demoModeRef.current = false;
      if (__DEV__) console.warn('demo_session_start_failed', sanitizedErrorMetadata(error));
      return { error: 'DEMO_START_FAILED' };
    }
  }, [enterDemo]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED' };
    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : HOSTED_PASSWORD_RESET_URL;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (error && __DEV__) console.warn('password_reset_request_failed', sanitizedErrorMetadata(error));
      return error ? { error: normalizeError(error) } : {};
    } catch (error) {
      if (__DEV__) console.warn('password_reset_request_failed', sanitizedErrorMetadata(error));
      return { error: normalizeError(error) };
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'SUPABASE_NOT_CONFIGURED' };
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (__DEV__) console.warn('password_update_failed', sanitizedErrorMetadata(error));
        return { error: normalizeError(error) };
      }
      setPasswordRecoveryActive(false);
      return {};
    } catch (error) {
      if (__DEV__) console.warn('password_update_failed', sanitizedErrorMetadata(error));
      return { error: normalizeError(error) };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (profile.isDemo) {
      demoModeRef.current = false;
      await AsyncStorage.multiRemove([DEMO_SESSION_KEY, DEMO_USAGE_KEY, DEMO_ORDERS_KEY]);
    } else if (supabase) await supabase.auth.signOut();
    setUserId(null);
    setProfile(EMPTY_PROFILE);
    setAddresses([]);
    setOrders([]);
    setNotifications([]);
    setCustomerEligibility(EMPTY_CUSTOMER_ELIGIBILITY);
    setCatalogCoupons([]);
    setCouponError(null);
    setDemoCouponUsage({});
  }, [profile.isDemo]);

  const placeOrder = useCallback(async (input: PlaceOrderInput) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    if (profile.isDemo) {
      const chosen = input.items.map((item) => ({ selection: item, service: services.find((service) => service.id === item.serviceId && service.enabled) })).filter((item) => item.service);
      if (chosen.length !== input.items.length) throw new Error('SERVICE_UNAVAILABLE');
      const subtotal = chosen.reduce((sum, item) => sum + item.service!.price * item.selection.quantity, 0);
      const coupon = DEMO_COUPONS.find((item) => item.code === input.couponCode);
      const selected = Object.fromEntries(chosen.map((item) => [item.service!.id, item.selection.quantity]));
      const chosenServices = chosen.map((item) => item.service!);
      const pickupFee = input.collectionMethod === 'home_pickup' ? businessSettings.pickupFee : 0;
      const deliveryFee = input.returnMethod === 'home_delivery' ? businessSettings.deliveryFee : 0;
      const discount = !coupon ? 0 : calculateCouponDiscount(coupon, subtotal, pickupFee, deliveryFee, chosenServices, selected);
      const address = addresses.find((item) => item.id === input.addressId) || DEMO_ADDRESS;
      const slot = input.collectionMethod === 'home_pickup' ? pickupSlots.find((item) => item.id === input.pickupSlotId) : null;
      if (input.collectionMethod === 'home_pickup' && !slot) throw new Error('PICKUP_SLOT_UNAVAILABLE');
      const createdAt = new Date().toISOString();
      const databaseId = createLocalDemoId('demo-order');
      const orderNumber = `DEMO-${Date.now().toString().slice(-8)}`;
      const total = Math.max(0, subtotal + pickupFee + deliveryFee - discount);
      const estimatedPricing = chosenServices.some((service) => service.pricingType === 'estimated');
      const nextOrder = mapOrder({
        id: databaseId, order_number: orderNumber, user_id: userId, status: 'pending',
        collection_method: input.collectionMethod, return_method: input.returnMethod,
        contact_phone: input.contactPhone.trim(), pickup_slot_id: slot?.id || null, pickup_date: slot?.date || null,
        pickup_start: slot?.startTime || null, pickup_end: slot?.endTime || null,
        pickup_slot: slot ? `${slot.date} · ${slot.startTime}–${slot.endTime}` : '',
        pickup_address: input.collectionMethod === 'home_pickup' ? address.detail : '',
        delivery_address: input.returnMethod === 'home_delivery' ? address.detail : '', pickup_instructions: input.pickupInstructions.trim(),
        customer_comment: input.customerComment.trim(), preferences: input.preferences,
        subtotal, pickup_fee: pickupFee, delivery_fee: deliveryFee,
        discount, pickup_benefit_discount: 0, estimated_total: total, final_total: estimatedPricing ? null : total, total,
        payment_method: input.paymentMethod, payment_status: 'unpaid',
        coupon_code_snapshot: coupon?.code || null,
        pricing_type: estimatedPricing ? 'estimated' : 'fixed', pricing_status: estimatedPricing ? 'estimated' : 'finalized',
        price_approval_status: 'not_required', is_demo: true, created_at: createdAt, updated_at: createdAt,
        order_items: chosen.map(({ selection, service }, index) => ({
          id: `${databaseId}-item-${index}`, service_id: service!.id, service_name: service!.name,
          service_icon: service!.icon, quantity: selection.quantity, price_unit: service!.priceUnit,
          unit_price: service!.price, line_total: service!.price * selection.quantity,
          pricing_type: service!.pricingType, preferences: selection.preferences,
        })),
        order_status_history: [{ id: `${databaseId}-history`, new_status: 'pending', actor_role: 'customer', comment: 'Demo order placed', created_at: createdAt }],
        support_messages: [], payments: [],
      });
      const nextOrders = [nextOrder, ...orders];
      await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders));
      setOrders(nextOrders);
      if (coupon) setDemoCouponUsage((current) => { const next = { ...current, [coupon.code]: (current[coupon.code] || 0) + 1 }; void AsyncStorage.setItem(DEMO_USAGE_KEY, JSON.stringify(next)); return next; });
      return { databaseId, id: orderNumber, amount: total };
    }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.rpc('place_order_v20', {
      p_items: input.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity, preferences: item.preferences })),
      p_preferences: input.preferences,
      p_collection_method: input.collectionMethod,
      p_return_method: input.returnMethod,
      p_pickup_slot_id: input.pickupSlotId || null,
      p_address_id: input.addressId || null,
      p_pickup_instructions: input.pickupInstructions,
      p_contact_phone: input.contactPhone,
      p_payment_method: input.paymentMethod,
      p_coupon_code: input.couponCode || null,
      p_customer_comment: input.customerComment,
      p_is_demo: false,
    });
    if (error) throw new Error(normalizeError(error));
    await Promise.all([loadCatalog(), loadAccount(userId), loadCoupons(userId)]);
    const result = data as { id: string; orderNumber: string; total: number };
    return { databaseId: result.id, id: result.orderNumber, amount: Number(result.total) };
  }, [addresses, businessSettings.deliveryFee, businessSettings.pickupFee, loadAccount, loadCatalog, loadCoupons, orders, pickupSlots, profile.isDemo, services, userId]);

  const withdrawOrder = useCallback(async (orderId: string) => {
    if (profile.isDemo) {
      const updatedAt = new Date().toISOString();
      const nextOrders = orders.map((order) => order.databaseId === orderId ? { ...order, status: 'cancelled' as const, progress: 0, updatedAt } : order);
      await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders));
      setOrders(nextOrders);
      return;
    }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.rpc('withdraw_order_v11', { p_order_id: orderId });
    if (error) throw new Error(normalizeError(error));
    if (userId) await loadAccount(userId);
  }, [loadAccount, orders, profile.isDemo, userId]);

  const respondToPrice = useCallback(async (orderId: string, approve: boolean, note = '') => {
    if (profile.isDemo) {
      const updatedAt = new Date().toISOString();
      const nextOrders = orders.map((order) => order.databaseId === orderId ? {
        ...order,
        priceApprovalStatus: approve ? 'approved' as const : 'rejected' as const,
        pricingStatus: approve ? 'finalized' as const : order.pricingStatus,
        updatedAt,
      } : order);
      await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders));
      setOrders(nextOrders);
      return;
    }
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { error } = await supabase.rpc('respond_to_price_v17', {
      p_order_id: orderId, p_approve: approve, p_note: note,
    });
    if (error) throw new Error(normalizeError(error));
    if (userId) await loadAccount(userId);
  }, [loadAccount, orders, profile.isDemo, userId]);

  const uploadOrderFile = useCallback(async (
    orderId: string,
    fileType: 'laundry_photo' | 'stain_photo' | 'payment_slip',
    selectedAsset?: { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number },
  ) => {
    if (profile.isDemo) {
      if (fileType !== 'payment_slip') return;
      const updatedAt = new Date().toISOString();
      const nextOrders = orders.map((order) => order.databaseId === orderId ? { ...order, hasPaymentSlip: true, paymentStatus: 'pending' as const, paymentConfirmationRequestedAt: updatedAt, paymentUpdatedAt: updatedAt, updatedAt } : order);
      await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders));
      setOrders(nextOrders);
      return;
    }
    if (!supabase || !userId) throw new Error('AUTH_REQUIRED');
    let asset = selectedAsset;
    if (!asset) {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('PHOTO_PERMISSION_REQUIRED');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 });
      if (result.canceled || !result.assets[0]) return;
      asset = result.assets[0];
    }
    const mimeType = asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('INVALID_FILE_FORMAT');
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const storagePath = `${userId}/${orderId}/${fileType}-${Date.now()}.${extension}`;
    const response = await fetch(asset.uri);
    const body = await response.arrayBuffer();
    if (!body.byteLength || body.byteLength > 10 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    const { error: uploadError } = await supabase.storage.from('order-uploads').upload(storagePath, body, {
      contentType: mimeType, upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);
    const { error: registerError } = await supabase.rpc('register_order_upload_v17', {
      p_order_id: orderId,
      p_file_type: fileType,
      p_storage_path: storagePath,
      p_mime_type: mimeType,
      p_size_bytes: asset.fileSize || body.byteLength,
    });
    if (registerError) {
      await supabase.storage.from('order-uploads').remove([storagePath]);
      throw new Error(registerError.message);
    }
    await loadAccount(userId);
  }, [loadAccount, orders, profile.isDemo, userId]);

  const beginPromptPayAttempt = useCallback(async (orderId: string, retry = false) => {
    const key = `attempt:${orderId}`;
    if (paymentSubmissionRef.current.has(key)) return;
    paymentSubmissionRef.current.add(key);
    try {
      if (profile.isDemo) {
        const updatedAt = new Date().toISOString();
        const nextOrders = orders.map((order) => order.databaseId === orderId ? {
          ...order, paymentMethod: 'promptpay' as const, paymentStatus: 'unpaid' as const,
          paymentReference: `DEMO-${order.id}-${Date.now().toString().slice(-4)}`,
          paymentExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
          paymentConfirmationRequestedAt: null, paymentFailureReason: '', updatedAt,
        } : order);
        await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders)); setOrders(nextOrders); return;
      }
      if (!supabase || !userId) throw new Error('AUTH_REQUIRED');
      const { error } = await supabase.rpc('prepare_promptpay_attempt_v19', { p_order_id: orderId, p_force_new: retry });
      if (error) throw new Error(normalizeError(error));
      await loadAccount(userId);
    } finally { paymentSubmissionRef.current.delete(key); }
  }, [loadAccount, orders, profile.isDemo, userId]);

  const requestPromptPayConfirmation = useCallback(async (orderId: string) => {
    const key = `confirmation:${orderId}`;
    if (paymentSubmissionRef.current.has(key)) return;
    paymentSubmissionRef.current.add(key);
    try {
      if (profile.isDemo) {
        const updatedAt = new Date().toISOString();
        const nextOrders = orders.map((order) => order.databaseId === orderId ? {
          ...order, paymentStatus: 'pending' as const, paymentConfirmationRequestedAt: updatedAt, updatedAt,
        } : order);
        await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders)); setOrders(nextOrders); return;
      }
      if (!supabase || !userId) throw new Error('AUTH_REQUIRED');
      const { data, error } = await supabase.rpc('request_promptpay_confirmation_v19', { p_order_id: orderId });
      if (error) throw new Error(normalizeError(error));
      await loadAccount(userId);
      if (data === 'expired') throw new Error('This PromptPay attempt expired. Generate a new QR and try again.');
    } finally { paymentSubmissionRef.current.delete(key); }
  }, [loadAccount, orders, profile.isDemo, userId]);

  const changeOrderPaymentMethod = useCallback(async (orderId: string, method: PaymentMethod) => {
    const key = `method:${orderId}`;
    if (paymentSubmissionRef.current.has(key)) return;
    paymentSubmissionRef.current.add(key);
    try {
      if (profile.isDemo) {
        const updatedAt = new Date().toISOString();
        const nextOrders = orders.map((order) => order.databaseId === orderId ? {
          ...order, paymentMethod: method, paymentStatus: 'unpaid' as const,
          paymentReference: null, paymentExpiresAt: null, paymentConfirmationRequestedAt: null,
          paymentFailureReason: '', updatedAt,
        } : order);
        await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders)); setOrders(nextOrders);
        if (method === 'promptpay') await beginPromptPayAttempt(orderId, true);
        return;
      }
      if (!supabase || !userId) throw new Error('AUTH_REQUIRED');
      const { error } = await supabase.rpc('customer_change_payment_method_v19', { p_order_id: orderId, p_method: method });
      if (error) throw new Error(normalizeError(error));
      await loadAccount(userId);
    } finally { paymentSubmissionRef.current.delete(key); }
  }, [beginPromptPayAttempt, loadAccount, orders, profile.isDemo, userId]);

  const sendOrderMessage = useCallback(async (orderId: string, rawMessage: string) => {
    if (!userId) throw new Error('AUTH_REQUIRED');
    const message = rawMessage.trim();
    if (!message) throw new Error('MESSAGE_REQUIRED');
    if (message.length > 1000) throw new Error('MESSAGE_TOO_LONG');
    if (messageSubmissionRef.current.has(orderId)) return;
    messageSubmissionRef.current.add(orderId);
    try {
      if (profile.isDemo) {
        const createdAt = new Date().toISOString();
        const nextOrders = orders.map((order) => order.databaseId === orderId ? {
          ...order,
          messages: [...order.messages, { id: createLocalDemoId('demo-message'), senderRole: 'customer' as const, message, createdAt }],
          updatedAt: createdAt,
        } : order);
        await AsyncStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(nextOrders));
        setOrders(nextOrders);
        return;
      }
      if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
      const { error } = await supabase.from('support_messages').insert({
        order_id: orderId,
        user_id: userId,
        sender_id: userId,
        sender_role: 'customer',
        reason: 'Order conversation',
        message,
      });
      if (error) throw new Error(normalizeError(error));
      await loadOrder(userId, orderId);
    } finally {
      messageSubmissionRef.current.delete(orderId);
    }
  }, [loadOrder, orders, profile.isDemo, userId]);

  const activeOrder = orders.find((order) => ACTIVE_ORDER_STATUSES.includes(order.status)) || null;
  const coupons = useMemo(
    () => profile.isDemo ? DEMO_COUPONS.filter((coupon) => {
      const usage = demoCouponUsage[coupon.code] || 0;
      const now = Date.now();
      return coupon.active
        && (!coupon.startsAt || new Date(coupon.startsAt).getTime() <= now)
        && (!coupon.expiresAt || new Date(coupon.expiresAt).getTime() > now)
        && (coupon.totalUsageLimit == null || coupon.usageCount < coupon.totalUsageLimit)
        && (coupon.perCustomerLimit == null || usage < coupon.perCustomerLimit);
    }) : catalogCoupons,
    [catalogCoupons, demoCouponUsage, profile.isDemo],
  );
  const unreadNotifications = notifications.filter((notification) => !notification.readAt && notification.orderId);
  const primaryAddress = addresses.find((address) => address.id === primaryAddressId) || addresses[0] || EMPTY_ADDRESS;

  const value = useMemo<AppContextValue>(() => ({
    profile, updateProfile,
    addresses, primaryAddressId, primaryAddress, addAddress, setPrimaryAddressId,
    paymentMethod, setPaymentMethod,
    language, setLanguage, t,
    notificationPreferences, setNotificationPreference,
    notifications, unreadNotifications, markNotificationRead, markAllNotificationsRead,
    services, coupons, couponLoading, couponError, pickupSlots, businessSettings, customerEligibility,
    supabaseConfigured: isSupabaseConfigured,
    authLoading, passwordRecoveryActive, dataLoading, dataError,
    userId, userRole: userId ? profile.role : null, isDemo: profile.isDemo,
    orders, activeOrder,
    signIn, signUp, continueDemo, requestPasswordReset, updatePassword,
    signOut, placeOrder, withdrawOrder, respondToPrice, beginPromptPayAttempt, requestPromptPayConfirmation,
    changeOrderPaymentMethod, sendOrderMessage, uploadOrderFile, refresh, refreshCoupons,
  }), [
    activeOrder, addAddress, addresses, authLoading, passwordRecoveryActive, businessSettings, continueDemo, couponError, couponLoading, coupons, customerEligibility,
    dataError, dataLoading, language, markAllNotificationsRead, markNotificationRead,
    notificationPreferences, notifications, orders, paymentMethod, pickupSlots, placeOrder,
    primaryAddress, primaryAddressId, profile, refresh, refreshCoupons, requestPasswordReset, respondToPrice,
    beginPromptPayAttempt, requestPromptPayConfirmation, changeOrderPaymentMethod, sendOrderMessage,
    services, setLanguage, setNotificationPreference, setPaymentMethod, setPrimaryAddressId,
    signIn, signOut, signUp, t, unreadNotifications, updatePassword, updateProfile, userId,
    uploadOrderFile, withdrawOrder,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
