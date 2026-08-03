'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  calculateOrderPreview, DEFAULT_SETTINGS, DEMO_SERVICES, DEMO_SLOTS,
  type Address, type BusinessSettings, type CartLine, type Coupon,
  type CustomerNotification, type CustomerOrder, type LanguageCode,
  type LaundryService, type PaymentMethod, type PickupSlot, type Profile,
  translate, type TranslationKey,
} from '@supershine/shared';

import { mapCoupon, mapNotification, mapOrder, mapService, mapSettings, mapSlot, ORDER_SELECT } from '@/lib/mappers';
import { getSupabase, supabaseConfigured } from '@/lib/supabase';

const CART_KEY = 'supershine.browser.cart.v1';
const LANGUAGE_KEY = 'supershine.browser.language.v1';
const DEMO_KEY = 'supershine.browser.demo.v1';
const DEMO_ORDERS_KEY = 'supershine.browser.demo-orders.v1';

const DEMO_ADDRESS: Address = { id: 'demo-address', label: 'Home', detail: '88 Sukhumvit Road, Bangkok', isPrimary: true };
const DEMO_COUPONS: Coupon[] = [
  { code: 'FRESH20', title: 'Welcome offer', description: 'Save 20% on a demo order.', discountTarget: 'service', discountType: 'percentage', discountValue: 20, maxDiscount: null, minimumOrder: 200, perCustomerLimit: 1, totalUsageLimit: null, usageCount: 0, serviceId: null, eligibleServiceIds: [], requiresVerifiedPhone: false, firstVerifiedProfileOnly: false, active: true },
  { code: 'DEMO50', title: 'Demo laundry credit', description: 'Save ฿50 in demo checkout.', discountTarget: 'service', discountType: 'fixed_amount', discountValue: 50, maxDiscount: null, minimumOrder: 250, perCustomerLimit: 2, totalUsageLimit: null, usageCount: 0, serviceId: null, eligibleServiceIds: [], requiresVerifiedPhone: false, firstVerifiedProfileOnly: false, active: true },
];

type AuthMode = 'guest' | 'customer' | 'demo';
type Feedback = { tone: 'success' | 'error' | 'info'; message: string } | null;

type CheckoutInput = {
  addressId: string; pickupSlotId: string; pickupInstructions: string; contactPhone: string;
  paymentMethod: PaymentMethod; couponCode?: string; customerComment: string;
};

type AppValue = {
  initialized: boolean; mode: AuthMode; userId: string | null; profile: Profile | null;
  services: LaundryService[]; coupons: Coupon[]; slots: PickupSlot[]; settings: BusinessSettings;
  addresses: Address[]; orders: CustomerOrder[]; notifications: CustomerNotification[];
  cart: CartLine[]; language: LanguageCode; catalogLoading: boolean; accountLoading: boolean;
  error: string | null; busy: string | null; feedback: Feedback; supabaseConfigured: boolean;
  t: (key: TranslationKey) => string; cartCount: number; unreadCount: number;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string, phone: string) => Promise<'signed-in' | 'confirmation' | null>;
  startDemo: () => void; signOut: () => Promise<void>; requestPasswordReset: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>; setLanguage: (language: LanguageCode) => void;
  setCartQuantity: (serviceId: string, quantity: number) => void; clearCart: () => void;
  saveAddress: (input: { label: string; detail: string; primary: boolean }) => Promise<boolean>;
  saveProfile: (input: { name: string; phone: string; paymentMethod: PaymentMethod }) => Promise<boolean>;
  placeOrder: (input: CheckoutInput) => Promise<CustomerOrder | null>;
  refresh: () => Promise<void>; markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>; respondToPrice: (orderId: string, approve: boolean) => Promise<boolean>;
  sendMessage: (orderId: string, message: string) => Promise<boolean>;
  uploadPaymentSlip: (orderId: string, file: File) => Promise<boolean>;
  dismissFeedback: () => void;
};

const AppContext = createContext<AppValue | null>(null);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

function safeAuthMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message).toLowerCase() : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  if (message.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (message.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (message.includes('captcha')) return 'Security verification failed. Please try again.';
  if (status === 429 || message.includes('too many')) return 'Too many attempts. Please wait and try again.';
  if (message.includes('already registered') || message.includes('already been registered')) return 'An account already uses this email.';
  return 'We could not connect. Please check your connection and try again.';
}

function createDemoOrder(lines: CartLine[], services: LaundryService[], settings: BusinessSettings, input: CheckoutInput, coupon?: Coupon) {
  const preview = calculateOrderPreview(lines, services, settings, coupon);
  const now = new Date().toISOString();
  const databaseId = `demo-order-${crypto.randomUUID()}`;
  const slot = DEMO_SLOTS.find((item) => item.id === input.pickupSlotId) ?? DEMO_SLOTS[0];
  const order: CustomerOrder = {
    databaseId, id: `DEMO-${Date.now().toString().slice(-8)}`, userId: 'browser-demo', status: 'requested',
    items: lines.map((line, index) => { const service = services.find((item) => item.id === line.serviceId)!; return { id: `${databaseId}-${index}`, serviceId: service.id, serviceName: service.name, serviceIcon: service.icon, quantity: line.quantity, priceUnit: service.priceUnit, unitPrice: service.price, lineTotal: service.price * line.quantity, pricingType: service.pricingType, preferences: line.preferences }; }),
    contactPhone: input.contactPhone, pickupSlotId: slot.id, pickupDate: slot.date, pickupStart: slot.startTime,
    pickupEnd: slot.endTime, pickupAddress: DEMO_ADDRESS.detail, pickupInstructions: input.pickupInstructions,
    customerComment: input.customerComment.trim(), subtotal: preview.subtotal, pickupFee: preview.pickupFee,
    deliveryFee: preview.deliveryFee, discount: preview.discount, pickupBenefitDiscount: 0,
    couponCode: coupon?.code ?? null, estimatedTotal: preview.total, finalTotal: null, amount: preview.total,
    pricingType: lines.some((line) => services.find((item) => item.id === line.serviceId)?.pricingType === 'estimated') ? 'estimated' : 'fixed',
    paymentMethod: input.paymentMethod, paymentStatus: 'pending', hasPaymentSlip: false,
    priceApprovalStatus: 'not_required', isDemo: true,
    history: [{ id: `${databaseId}-history`, newStatus: 'requested', actorRole: 'customer', comment: 'Demo order placed', createdAt: now }],
    messages: [], createdAt: now, updatedAt: now,
  };
  return order;
}

export function WebAppProvider({ children }: PropsWithChildren) {
  const supabase = useMemo(() => getSupabase(), []);
  const [initialized, setInitialized] = useState(false);
  const [mode, setMode] = useState<AuthMode>('guest');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [accountLoading, setAccountLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const orderSubmitting = useRef(false);

  const updateDemoOrders = useCallback((update: (current: CustomerOrder[]) => CustomerOrder[]) => {
    setOrders((current) => {
      const next = update(current);
      window.localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadCatalog = useCallback(async () => {
    if (mode === 'demo') { setServices(DEMO_SERVICES); setSlots(DEMO_SLOTS); setSettings(DEFAULT_SETTINGS); setCoupons(DEMO_COUPONS); setCatalogLoading(false); return; }
    if (!supabase) { setError('Supabase is not configured for the browser app.'); setCatalogLoading(false); return; }
    setCatalogLoading(true);
    const [serviceResult, slotResult, settingResult] = await Promise.all([
      supabase.from('services').select('*, service_options(*)').order('sort_order'),
      supabase.from('pickup_slots').select('*').eq('enabled', true).order('slot_date').order('start_time'),
      supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    const firstError = serviceResult.error || slotResult.error || settingResult.error;
    setCatalogLoading(false);
    if (firstError) { setError('We could not load services. Please check your connection.'); return; }
    setServices((serviceResult.data ?? []).map((row) => mapService(row)).sort((a, b) => a.sortOrder - b.sortOrder));
    setSlots((slotResult.data ?? []).map((row) => mapSlot(row)));
    setSettings(mapSettings(settingResult.data));
    setError(null);
  }, [mode, supabase]);

  const loadCoupons = useCallback(async () => {
    if (mode === 'demo') { setCoupons(DEMO_COUPONS); return; }
    if (!supabase || !session?.user.id) { setCoupons([]); return; }
    const eligible = await supabase.rpc('get_eligible_coupons_v15');
    if (!eligible.error) { setCoupons((eligible.data ?? []).map((row: Record<string, unknown>) => mapCoupon(row))); return; }
    const legacy = await supabase.from('coupons').select('*').eq('active', true);
    if (!legacy.error) setCoupons((legacy.data ?? []).map((row) => mapCoupon(row)));
  }, [mode, session?.user.id, supabase]);

  const loadAccount = useCallback(async (userId: string) => {
    if (!supabase) return;
    setAccountLoading(true);
    const profileResult = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profileResult.error || !profileResult.data) {
      setAccountLoading(false); setError('You signed in, but your profile could not be loaded.'); return;
    }
    const row = profileResult.data;
    if (row.role !== 'customer') {
      await supabase.auth.signOut(); setSession(null); setMode('guest'); setAccountLoading(false);
      setError('This browser application is for customer accounts.'); return;
    }
    const [addressResult, orderResult, notificationResult] = await Promise.all([
      supabase.from('addresses').select('*').eq('user_id', userId).order('is_primary', { ascending: false }),
      supabase.from('orders').select(ORDER_SELECT).eq('user_id', userId).eq('is_demo', false).order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    const firstError = addressResult.error || orderResult.error || notificationResult.error;
    setProfile({ id: row.id, name: row.full_name ?? '', email: row.email ?? session?.user.email ?? '', phone: row.phone ?? '', role: 'customer', language: (['en', 'th', 'my', 'bn', 'dz'].includes(row.language) ? row.language : language) as LanguageCode, defaultPaymentMethod: row.default_payment_method === 'cash' ? 'cash_delivery' : row.default_payment_method ?? 'cash_delivery', defaultPreferences: row.default_preferences ?? {}, isDemo: false });
    if (firstError) { setError('Your account signed in, but some information could not be loaded.'); }
    else {
      setAddresses((addressResult.data ?? []).map((address) => ({ id: address.id, label: address.label, detail: address.address_line, isPrimary: address.is_primary })));
      setOrders((orderResult.data ?? []).map((order) => mapOrder(order)));
      setNotifications((notificationResult.data ?? []).map((item) => mapNotification(item)));
      setError(null);
    }
    setAccountLoading(false);
  }, [language, session?.user.email, supabase]);

  const refresh = useCallback(async () => {
    await loadCatalog();
    if (mode === 'customer' && session?.user.id) await Promise.all([loadAccount(session.user.id), loadCoupons()]);
    if (mode === 'demo') { setOrders(readJson(DEMO_ORDERS_KEY, [])); setAddresses([DEMO_ADDRESS]); }
  }, [loadAccount, loadCatalog, loadCoupons, mode, session?.user.id]);

  useEffect(() => {
    setCart(readJson(CART_KEY, []));
    const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && ['en', 'th', 'my', 'bn', 'dz'].includes(savedLanguage)) setLanguageState(savedLanguage as LanguageCode);
    if (window.localStorage.getItem(DEMO_KEY) === 'active') {
      setMode('demo'); setProfile({ id: 'browser-demo', name: 'Demo Customer', email: '', phone: '092-000-0000', role: 'customer', language: 'en', defaultPaymentMethod: 'cash_delivery', defaultPreferences: {}, isDemo: true });
      setAddresses([DEMO_ADDRESS]); setOrders(readJson(DEMO_ORDERS_KEY, [])); setInitialized(true); return;
    }
    if (!supabase) { setInitialized(true); return; }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) { setMode('customer'); void loadAccount(data.session.user.id); }
      setInitialized(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) { setMode('customer'); void loadAccount(nextSession.user.id); }
      else if (window.localStorage.getItem(DEMO_KEY) !== 'active') { setMode('guest'); setProfile(null); }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadAccount, supabase]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { if (mode !== 'guest') void loadCoupons(); }, [loadCoupons, mode]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    if (!supabase || mode === 'demo') return;
    const channel = supabase.channel('customer-web-public-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => void loadCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_options' }, () => void loadCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_slots' }, () => void loadCatalog())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, () => void loadCatalog())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadCatalog, mode, supabase]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || mode !== 'customer' || !userId) return;
    const refreshAccount = () => void loadAccount(userId);
    const channel = supabase.channel(`customer-web-account-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, refreshAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refreshAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages', filter: `user_id=eq.${userId}` }, refreshAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${userId}` }, refreshAccount)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadAccount, mode, session?.user.id, supabase]);

  useEffect(() => {
    const recover = () => { if (document.visibilityState === 'visible') void refresh(); };
    const online = () => void refresh();
    document.addEventListener('visibilitychange', recover); window.addEventListener('online', online);
    return () => { document.removeEventListener('visibilitychange', recover); window.removeEventListener('online', online); };
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase || busy) return false;
    setBusy('sign-in'); setError(null); window.localStorage.removeItem(DEMO_KEY);
    const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(null);
    if (result.error) { setError(safeAuthMessage(result.error)); return false; }
    setSession(result.data.session); setMode('customer'); await loadAccount(result.data.user.id); return true;
  }, [busy, loadAccount, supabase]);

  const signUp = useCallback(async (name: string, email: string, password: string, phone: string) => {
    if (!supabase || busy) return null;
    setBusy('sign-up'); setError(null);
    const result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name.trim(), phone: phone.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setBusy(null);
    if (result.error) { setError(safeAuthMessage(result.error)); return null; }
    if (!result.data.session) { setFeedback({ tone: 'success', message: 'Check your email to confirm your account.' }); return 'confirmation'; }
    setSession(result.data.session); setMode('customer'); await loadAccount(result.data.user!.id); return 'signed-in';
  }, [busy, loadAccount, supabase]);

  const startDemo = useCallback(() => {
    window.localStorage.setItem(DEMO_KEY, 'active'); setMode('demo'); setSession(null);
    setProfile({ id: 'browser-demo', name: 'Demo Customer', email: '', phone: '092-000-0000', role: 'customer', language, defaultPaymentMethod: 'cash_delivery', defaultPreferences: {}, isDemo: true });
    setAddresses([DEMO_ADDRESS]); setOrders(readJson(DEMO_ORDERS_KEY, [])); setServices(DEMO_SERVICES);
    setSlots(DEMO_SLOTS); setCoupons(DEMO_COUPONS); setSettings(DEFAULT_SETTINGS); setError(null);
  }, [language]);

  const signOut = useCallback(async () => {
    if (mode === 'demo') window.localStorage.removeItem(DEMO_KEY);
    else if (supabase) await supabase.auth.signOut();
    setMode('guest'); setSession(null); setProfile(null); setAddresses([]); setOrders([]); setNotifications([]); setCoupons([]); setFeedback(null); setError(null);
  }, [mode, supabase]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase || busy) return false;
    setBusy('password-reset');
    const result = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(null);
    if (result.error) { setError(safeAuthMessage(result.error)); return false; }
    setFeedback({ tone: 'success', message: 'Password reset instructions were sent to your email.' }); return true;
  }, [busy, supabase]);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase || busy) return false;
    setBusy('update-password'); const result = await supabase.auth.updateUser({ password }); setBusy(null);
    if (result.error) { setError(safeAuthMessage(result.error)); return false; }
    setFeedback({ tone: 'success', message: 'Your password has been updated.' }); return true;
  }, [busy, supabase]);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next); window.localStorage.setItem(LANGUAGE_KEY, next);
    if (supabase && session?.user.id && mode === 'customer') void supabase.from('profiles').update({ language: next }).eq('id', session.user.id);
  }, [mode, session?.user.id, supabase]);

  const setCartQuantity = useCallback((serviceId: string, quantity: number) => {
    setCart((current) => {
      const service = services.find((item) => item.id === serviceId);
      if (!service?.enabled) { setFeedback({ tone: 'error', message: 'This service is temporarily unavailable.' }); return current; }
      const remaining = current.filter((line) => line.serviceId !== serviceId);
      const next = quantity > 0 ? [...remaining, { serviceId, quantity: Math.min(99, quantity), preferences: {} }] : remaining;
      window.localStorage.setItem(CART_KEY, JSON.stringify(next)); return next;
    });
  }, [services]);
  const clearCart = useCallback(() => { setCart([]); window.localStorage.removeItem(CART_KEY); }, []);

  const saveAddress = useCallback(async (input: { label: string; detail: string; primary: boolean }) => {
    if (mode === 'demo') { const next = { id: `demo-${crypto.randomUUID()}`, label: input.label, detail: input.detail, isPrimary: input.primary }; setAddresses((current) => input.primary ? [next, ...current.map((item) => ({ ...item, isPrimary: false }))] : [...current, next]); setFeedback({ tone: 'success', message: 'Demo address saved.' }); return true; }
    if (!supabase || !session?.user.id || busy) return false;
    setBusy('address');
    if (input.primary) await supabase.from('addresses').update({ is_primary: false }).eq('user_id', session.user.id);
    const result = await supabase.from('addresses').insert({ user_id: session.user.id, label: input.label.trim(), address_line: input.detail.trim(), is_primary: input.primary });
    setBusy(null);
    if (result.error) { setError('We could not save this address.'); return false; }
    await loadAccount(session.user.id); setFeedback({ tone: 'success', message: 'Address saved.' }); return true;
  }, [busy, loadAccount, mode, session?.user.id, supabase]);

  const saveProfile = useCallback(async (input: { name: string; phone: string; paymentMethod: PaymentMethod }) => {
    if (mode === 'demo') { setProfile((current) => current ? { ...current, name: input.name, phone: input.phone, defaultPaymentMethod: input.paymentMethod } : current); setFeedback({ tone: 'success', message: 'Demo profile updated.' }); return true; }
    if (!supabase || !session?.user.id || busy) return false;
    setBusy('profile'); const result = await supabase.from('profiles').update({ full_name: input.name.trim(), phone: input.phone.trim(), default_payment_method: input.paymentMethod }).eq('id', session.user.id); setBusy(null);
    if (result.error) { setError('We could not update your profile.'); return false; }
    await loadAccount(session.user.id); setFeedback({ tone: 'success', message: 'Profile updated.' }); return true;
  }, [busy, loadAccount, mode, session?.user.id, supabase]);

  const placeOrder = useCallback(async (input: CheckoutInput) => {
    if (orderSubmitting.current || !cart.length) return null;
    orderSubmitting.current = true; setBusy('place-order'); setError(null);
    try {
      if (mode === 'demo') {
        const coupon = coupons.find((item) => item.code === input.couponCode);
        const order = createDemoOrder(cart, services, settings, input, coupon);
        const next = [order, ...orders]; setOrders(next); window.localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(next)); clearCart();
        setFeedback({ tone: 'success', message: 'Demo order placed.' }); return order;
      }
      if (!supabase || !session?.user.id) { setError('Please sign in before placing an order.'); return null; }
      const result = await supabase.rpc('place_order_v11', {
        p_items: cart.map((line) => ({ serviceId: line.serviceId, quantity: line.quantity, preferences: line.preferences })),
        p_preferences: {}, p_pickup_slot_id: input.pickupSlotId, p_address_id: input.addressId,
        p_pickup_instructions: input.pickupInstructions.trim(), p_contact_phone: input.contactPhone.trim(),
        p_payment_method: input.paymentMethod, p_coupon_code: input.couponCode || null,
        p_customer_comment: input.customerComment.trim(), p_is_demo: false,
      });
      if (result.error) { setError('We could not place your order. Please review your selections and try again.'); return null; }
      clearCart(); await loadAccount(session.user.id);
      const resultData = result.data as { id: string };
      const saved = (await supabase.from('orders').select(ORDER_SELECT).eq('id', resultData.id).single()).data;
      setFeedback({ tone: 'success', message: 'Your order has been placed.' }); return saved ? mapOrder(saved) : orders[0] ?? null;
    } finally { orderSubmitting.current = false; setBusy(null); }
  }, [cart, clearCart, coupons, loadAccount, mode, orders, services, session?.user.id, settings, supabase]);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    if (supabase && mode === 'customer' && session?.user.id) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', session.user.id);
  }, [mode, session?.user.id, supabase]);
  const markAllNotificationsRead = useCallback(async () => {
    const now = new Date().toISOString(); setNotifications((current) => current.map((item) => ({ ...item, readAt: now })));
    if (supabase && mode === 'customer' && session?.user.id) await supabase.from('notifications').update({ read_at: now }).eq('user_id', session.user.id).is('read_at', null);
  }, [mode, session?.user.id, supabase]);

  const respondToPrice = useCallback(async (orderId: string, approve: boolean) => {
    if (mode === 'demo') { updateDemoOrders((current) => current.map((order) => order.databaseId === orderId ? { ...order, priceApprovalStatus: approve ? 'approved' : 'rejected', status: approve ? 'received' : 'on_hold' } : order)); return true; }
    if (!supabase || busy) return false;
    setBusy('price-response'); const result = await supabase.rpc('respond_to_price_v17', { p_order_id: orderId, p_approve: approve, p_note: '' }); setBusy(null);
    if (result.error) { setError('We could not save your price response.'); return false; }
    if (session?.user.id) await loadAccount(session.user.id); return true;
  }, [busy, loadAccount, mode, session?.user.id, supabase, updateDemoOrders]);

  const sendMessage = useCallback(async (orderId: string, rawMessage: string) => {
    const message = rawMessage.trim(); if (!message || message.length > 1000 || busy) return false;
    if (mode === 'demo') { const now = new Date().toISOString(); updateDemoOrders((current) => current.map((order) => order.databaseId === orderId ? { ...order, messages: [...order.messages, { id: `demo-message-${crypto.randomUUID()}`, senderRole: 'customer', message, createdAt: now }] } : order)); return true; }
    if (!supabase || !session?.user.id) return false;
    setBusy('message'); const result = await supabase.from('support_messages').insert({ order_id: orderId, user_id: session.user.id, sender_id: session.user.id, sender_role: 'customer', reason: 'Order conversation', message }); setBusy(null);
    if (result.error) { setError('Your message could not be sent.'); return false; }
    await loadAccount(session.user.id); return true;
  }, [busy, loadAccount, mode, session?.user.id, supabase, updateDemoOrders]);

  const uploadPaymentSlip = useCallback(async (orderId: string, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image smaller than 10 MB.'); return false; }
    if (mode === 'demo') { updateDemoOrders((current) => current.map((order) => order.databaseId === orderId ? { ...order, hasPaymentSlip: true, paymentStatus: 'waiting_verification' } : order)); setFeedback({ tone: 'info', message: 'Demo payment submitted for simulated review.' }); return true; }
    if (!supabase || !session?.user.id || busy) return false;
    setBusy('payment-slip'); const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${session.user.id}/${orderId}/payment_slip-${Date.now()}.${extension}`;
    const upload = await supabase.storage.from('order-uploads').upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) { setBusy(null); setError('We could not upload your payment slip.'); return false; }
    const register = await supabase.rpc('register_order_upload_v17', { p_order_id: orderId, p_file_type: 'payment_slip', p_storage_path: path, p_mime_type: file.type, p_size_bytes: file.size });
    setBusy(null);
    if (register.error) { await supabase.storage.from('order-uploads').remove([path]); setError('We could not submit your payment slip.'); return false; }
    await loadAccount(session.user.id); setFeedback({ tone: 'success', message: 'Payment submitted for review.' }); return true;
  }, [busy, loadAccount, mode, session?.user.id, supabase, updateDemoOrders]);

  const value = useMemo<AppValue>(() => ({
    initialized, mode, userId: mode === 'demo' ? 'browser-demo' : session?.user.id ?? null, profile,
    services, coupons, slots, settings, addresses, orders, notifications, cart, language,
    catalogLoading, accountLoading, error, busy, feedback, supabaseConfigured,
    t: (key) => translate(language, key), cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    unreadCount: notifications.filter((item) => !item.readAt).length,
    signIn, signUp, startDemo, signOut, requestPasswordReset, updatePassword, setLanguage,
    setCartQuantity, clearCart, saveAddress, saveProfile, placeOrder, refresh,
    markNotificationRead, markAllNotificationsRead, respondToPrice, sendMessage, uploadPaymentSlip,
    dismissFeedback: () => setFeedback(null),
  }), [accountLoading, addresses, busy, cart, catalogLoading, coupons, error, feedback, initialized, language, markAllNotificationsRead, markNotificationRead, mode, notifications, orders, placeOrder, profile, refresh, requestPasswordReset, respondToPrice, saveAddress, saveProfile, sendMessage, services, session?.user.id, settings, signIn, signOut, signUp, slots, startDemo, updatePassword, uploadPaymentSlip, setCartQuantity, clearCart, setLanguage]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useWebApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useWebApp must be used within WebAppProvider');
  return value;
}
