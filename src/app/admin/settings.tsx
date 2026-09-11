import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { AdminCard, AdminPage, AdminSectionTabs, EmptyState, ErrorState, SectionTitle, StatusBadge } from '@/admin/admin-ui';
import { bangkokDate, defaultPickupSlotRows } from '@/admin/pickup-slots';
import { Button } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium, Radius } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht, mapCoupon, mapPickupSlot, mapService, mapSettings } from '@/lib/domain';
import { supabase } from '@/lib/supabase';
import type { BusinessSettings, Coupon, LaundryService, PickupSlot } from '@/types/domain';

type Category = 'business' | 'slots' | 'services' | 'payments' | 'promotions' | 'contact';
const CATEGORIES: { id: Category; label: string; description: string }[] = [
  { id: 'business', label: 'Business', description: 'Store, hours, areas, and fees' },
  { id: 'services', label: 'Services', description: 'Pricing and turnaround' },
  { id: 'slots', label: 'Pickup slots', description: 'Availability and capacity' },
  { id: 'payments', label: 'Payments', description: 'PromptPay QR and cash options' },
  { id: 'promotions', label: 'Coupons', description: 'Rules, limits, and availability' },
  { id: 'contact', label: 'Contact', description: 'Customer-facing support details' },
];

function couponStatus(coupon: Coupon) {
  const now = Date.now();
  if (!coupon.title.trim() || (coupon.discountType !== 'free' && coupon.discountValue <= 0)) return 'Draft';
  if (!coupon.active) return 'Inactive';
  if (coupon.totalUsageLimit != null && coupon.usageCount >= coupon.totalUsageLimit) return 'Exhausted';
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return 'Expired';
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return 'Scheduled';
  return 'Active';
}

function couponValidation(coupon: Coupon) {
  if (!coupon.title.trim()) return 'Enter a customer-facing title.';
  if (coupon.discountType === 'free' && coupon.discountTarget === 'service') return 'Free is only available for pickup or delivery fees. Use 100% for a free service promotion.';
  if (coupon.discountType === 'percentage' && (coupon.discountValue <= 0 || coupon.discountValue > 100)) return 'Percentage must be greater than 0 and no more than 100.';
  if (coupon.discountType === 'fixed_amount' && coupon.discountValue <= 0) return 'Fixed amount must be greater than 0.';
  if (coupon.maxDiscount != null && coupon.maxDiscount <= 0) return 'Maximum discount must be greater than 0.';
  if (coupon.minimumOrder < 0) return 'Minimum service subtotal cannot be negative.';
  if (coupon.perCustomerLimit != null && coupon.perCustomerLimit < 1) return 'Per-customer limit must be at least 1.';
  if (coupon.totalUsageLimit != null && coupon.totalUsageLimit < 1) return 'Total limit must be at least 1.';
  if (coupon.startsAt && Number.isNaN(new Date(coupon.startsAt).getTime())) return 'Enter a valid start date and time.';
  if (coupon.expiresAt && Number.isNaN(new Date(coupon.expiresAt).getTime())) return 'Enter a valid end date and time.';
  if (coupon.startsAt && coupon.expiresAt && new Date(coupon.startsAt) >= new Date(coupon.expiresAt)) return 'End date must be later than start date.';
  return '';
}

function confirmAdminAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', onPress: onConfirm },
  ]);
}

export default function AdminSettings() {
  const { profile, refresh } = useApp();
  const [category, setCategory] = useState<Category>('business');
  const [settings, setSettings] = useState<BusinessSettings>(mapSettings());
  const [services, setServices] = useState<LaundryService[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponSchemaFields, setCouponSchemaFields] = useState<Set<string>>(new Set());
  const [newCouponCode, setNewCouponCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState<Set<Category>>(new Set());

  const load = useCallback(async () => {
    if (!supabase || profile.role !== 'admin') return;
    setLoading(true); setError('');
    const [settingsResult, servicesResult, couponResult, slotResult] = await Promise.all([
      supabase.from('business_settings').select('*').eq('id', 1).single(),
      supabase.from('services').select('*, service_options(*)').order('sort_order'),
      supabase.from('coupons').select('*').order('code'),
      supabase.from('pickup_slots').select('*').gte('slot_date', bangkokDate()).order('slot_date').order('start_time'),
    ]);
    setLoading(false);
    const queryError = settingsResult.error || servicesResult.error || couponResult.error || slotResult.error;
    if (queryError) return setError(queryError.message);
    setSettings(mapSettings(settingsResult.data));
    setServices((servicesResult.data || []).map(mapService));
    const couponRows = couponResult.data || [];
    setCoupons(couponRows.map(mapCoupon));
    setCouponSchemaFields(new Set(Object.keys(couponRows[0] || {})));
    setSlots((slotResult.data || []).map(mapPickupSlot));
    setDirty(new Set());
  }, [profile.role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setFeedback(''), 3200); return () => clearTimeout(timer); }, [feedback]);

  function markDirty(section: Category) { setDirty((current) => new Set(current).add(section)); }
  function clearDirty(section: Category) { setDirty((current) => { const next = new Set(current); next.delete(section); return next; }); }
  function chooseCategory(next: Category) {
    if (next === category) return;
    if (!dirty.has(category)) return setCategory(next);
    confirmAdminAction('Unsaved changes', `Save the ${CATEGORIES.find((item) => item.id === category)?.label.toLowerCase()} section before leaving it.`, () => setCategory(next));
  }

  async function runSave(key: string, section: Category, action: () => PromiseLike<{ error: { message: string } | null }>, message: string) {
    if (savingKey) return;
    setSavingKey(key); setError('');
    const result = await action();
    setSavingKey('');
    if (result.error) return setError(result.error.message);
    clearDirty(section);
    setFeedback(message);
  }

  const updateBusinessSettings: Dispatch<SetStateAction<BusinessSettings>> = (action) => { markDirty('business'); setSettings(action); };
  const updateContactSettings: Dispatch<SetStateAction<BusinessSettings>> = (action) => { markDirty('contact'); setSettings(action); };
  const updatePaymentSettings: Dispatch<SetStateAction<BusinessSettings>> = (action) => { markDirty('payments'); setSettings(action); };
  function saveBusiness() { const client = supabase; if (!client) return; void runSave('business', 'business', () => client.from('business_settings').update({ store_name: settings.storeName, open_time: settings.openTime, close_time: settings.closeTime, manual_status: settings.manualStatus, pickup_fee: settings.pickupFee, delivery_fee: settings.deliveryFee, service_areas: settings.serviceAreas }).eq('id', 1), 'Business settings saved.').then(() => refresh()); }
  function saveContact() { const client = supabase; if (!client) return; void runSave('contact', 'contact', () => client.from('business_settings').update({ business_phone: settings.businessPhone, line_url: settings.lineUrl }).eq('id', 1), 'Contact settings saved.').then(() => refresh()); }
  function savePayments() { const client = supabase; if (!client) return; void runSave('payments', 'payments', () => client.from('business_settings').update({ promptpay_enabled: settings.promptPayEnabled, promptpay_display_name: settings.promptPayDisplayName.trim(), promptpay_identifier: settings.promptPayIdentifier.trim(), promptpay_instructions: settings.promptPayInstructions.trim(), promptpay_attempt_minutes: Math.max(5, Math.min(60, settings.promptPayAttemptMinutes)) }).eq('id', 1), 'Payment settings saved.').then(() => refresh()); }
  function updateService(id: string, patch: Partial<LaundryService>) { markDirty('services'); setServices((current) => current.map((service) => service.id === id ? { ...service, ...patch } : service)); }
  function saveService(service: LaundryService) { const client = supabase; if (!client) return; void runSave(`service-${service.id}`, 'services', () => client.from('services').update({ price: service.price, price_unit: service.priceUnit, turnaround_hours: service.turnaroundHours, enabled: service.enabled }).eq('id', service.id), `${service.name} saved.`).then(() => refresh()); }
  function updateSlot(id: string, patch: Partial<PickupSlot>) { markDirty('slots'); setSlots((current) => current.map((slot) => slot.id === id ? { ...slot, ...patch } : slot)); }
  function saveSlot(slot: PickupSlot) { const client = supabase; if (!client) return; if (slot.capacity < slot.bookedCount || slot.capacity < 1) return setError('Capacity cannot be lower than existing bookings.'); void runSave(`slot-${slot.id}`, 'slots', () => client.from('pickup_slots').update({ capacity: slot.capacity, enabled: slot.enabled }).eq('id', slot.id), 'Pickup slot saved.'); }
  async function fillPickupSlots() {
    if (!supabase || savingKey) return;
    setSavingKey('slots-fill');
    setError('');
    const result = await supabase.from('pickup_slots').upsert(defaultPickupSlotRows(), {
      onConflict: 'slot_date,start_time,end_time',
      ignoreDuplicates: true,
    });
    setSavingKey('');
    if (result.error) return setError(result.error.message);
    setFeedback('The standard pickup schedule is available for the next 14 days.');
    await load();
    await refresh();
  }
  function updateCoupon(code: string, patch: Partial<Coupon>) { setError(''); markDirty('promotions'); setCoupons((current) => current.map((coupon) => coupon.code === code ? { ...coupon, ...patch } : coupon)); }
  function saveCoupon(coupon: Coupon) {
    const client = supabase;
    if (!client) return;
    const validation = couponValidation(coupon);
    if (validation) return setError(validation);
    const supportsAdvancedCoupons = couponSchemaFields.has('discount_target') && couponSchemaFields.has('eligible_service_ids');
    let payload: Record<string, unknown>;
    if (supportsAdvancedCoupons) {
      payload = {
        title: coupon.title, description: coupon.description, discount_target: coupon.discountTarget,
        discount_type: coupon.discountType, discount_value: coupon.discountType === 'free' ? 0 : coupon.discountValue,
        max_discount: coupon.discountType === 'percentage' ? coupon.maxDiscount : null,
        minimum_order: coupon.minimumOrder, starts_at: coupon.startsAt || null, expires_at: coupon.expiresAt || null,
        per_customer_limit: coupon.perCustomerLimit, total_usage_limit: coupon.totalUsageLimit,
        eligible_service_ids: coupon.eligibleServiceIds, service_id: coupon.eligibleServiceIds[0] || null, active: coupon.active,
        ...(couponSchemaFields.has('first_verified_profile_only') ? { first_verified_profile_only: coupon.firstVerifiedProfileOnly } : {}),
      };
    } else {
      if (coupon.maxDiscount != null || coupon.firstVerifiedProfileOnly) return setError('Deploy the coupon database migration before saving maximum-discount or new-customer-only rules.');
      const legacyType = coupon.discountTarget === 'pickup_fee' && coupon.discountType === 'free'
        ? 'free_pickup'
        : coupon.discountTarget === 'service' && coupon.discountType === 'percentage' && coupon.eligibleServiceIds.length
          ? 'service_percentage'
          : coupon.discountTarget === 'service' && coupon.discountType === 'percentage'
            ? 'percentage'
            : coupon.discountTarget === 'service' && coupon.discountType === 'fixed_amount' ? 'fixed' : '';
      if (!legacyType) return setError('Deploy the coupon database migration before saving this discount target and method.');
      if (coupon.eligibleServiceIds.length > 1) return setError('The current database supports one eligible service per coupon. Deploy the coupon migration to select several services.');
      payload = {
        title: coupon.title, description: coupon.description, discount_type: legacyType,
        discount_value: legacyType === 'free_pickup' ? 0 : coupon.discountValue,
        minimum_order: coupon.minimumOrder, starts_at: coupon.startsAt || null, expires_at: coupon.expiresAt || null,
        per_customer_limit: coupon.perCustomerLimit, total_usage_limit: coupon.totalUsageLimit,
        service_id: coupon.eligibleServiceIds[0] || null, active: coupon.active,
      };
    }
    const persist = () => void runSave(`coupon-${coupon.code}`, 'promotions', () => client.from('coupons').update(payload).eq('code', coupon.code), `${coupon.code} saved.`).then(() => refresh());
    if (coupon.usageCount > 0) confirmAdminAction('Update used coupon?', `${coupon.code} has ${coupon.usageCount} successful redemptions. Existing order totals will not change.`, persist);
    else persist();
  }
  function deleteCoupon(coupon: Coupon) {
    if (!supabase || savingKey) return;
    const client = supabase;
    const hasHistory = coupon.usageCount > 0;
    const perform = () => void (async () => {
      setSavingKey(`coupon-delete-${coupon.code}`);
      setError('');
      const result = hasHistory
        ? await client.from('coupons').update({ active: false }).eq('code', coupon.code)
        : await client.from('coupons').delete().eq('code', coupon.code);
      setSavingKey('');
      if (result.error) return setError(result.error.message);
      clearDirty('promotions');
      if (hasHistory) {
        setCoupons((current) => current.map((item) => item.code === coupon.code ? { ...item, active: false } : item));
        setFeedback(`${coupon.code} deactivated. Redemption and order history was preserved.`);
      } else {
        setCoupons((current) => current.filter((item) => item.code !== coupon.code));
        setFeedback(`${coupon.code} deleted.`);
      }
    })();
    confirmAdminAction(
      hasHistory ? 'Deactivate used coupon?' : 'Delete coupon permanently?',
      hasHistory
        ? `${coupon.code} has ${coupon.usageCount} successful redemptions, so it cannot be permanently deleted without breaking history. It will be deactivated instead.`
        : `${coupon.code} has no redemption history. This action cannot be undone.`,
      perform,
    );
  }
  async function createCoupon() {
    if (!supabase || savingKey) return;
    const code = newCouponCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return setError('Use 3–24 letters, numbers, dashes, or underscores.');
    const supportsAdvancedCoupons = couponSchemaFields.has('discount_target') && couponSchemaFields.has('eligible_service_ids');
    const payload = supportsAdvancedCoupons
      ? {
          code, title: code, description: '', discount_target: 'service', discount_type: 'fixed_amount',
          discount_value: 10, max_discount: null, minimum_order: 0, eligible_service_ids: [], active: false,
          ...(couponSchemaFields.has('first_verified_profile_only') ? { first_verified_profile_only: false } : {}),
        }
      : { code, title: code, description: '', discount_type: 'fixed', discount_value: 10, minimum_order: 0, active: false };
    setSavingKey('new-coupon');
    const { data, error: createError } = await supabase.from('coupons').insert(payload).select('*').single();
    setSavingKey('');
    if (createError) return setError(createError.message);
    setCoupons((current) => [...current, mapCoupon(data)].sort((a, b) => a.code.localeCompare(b.code)));
    setNewCouponCode('');
    setFeedback('Inactive coupon created. Set its rules before activating it.');
  }
  async function uploadPromptPayQr() {
    if (!supabase || savingKey) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo permission is required.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    setSavingKey('promptpay'); setError('');
    const asset = result.assets[0];
    const response = await fetch(asset.uri);
    const body = await response.arrayBuffer();
    const extension = asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg';
    const path = `promptpay/promptpay-${Date.now()}.${extension}`;
    const upload = await supabase.storage.from('business-public').upload(path, body, { contentType: asset.mimeType || 'image/jpeg' });
    if (upload.error) { setSavingKey(''); return setError('The PromptPay QR could not be uploaded. Please try again.'); }
    const config = await supabase.from('business_settings').update({ promptpay_qr_path: path, promptpay_enabled: true }).eq('id', 1);
    setSavingKey('');
    if (config.error) {
      await supabase.storage.from('business-public').remove([path]);
      return setError('The PromptPay QR was uploaded but could not be activated. Please try again.');
    }
    setSettings((current) => ({ ...current, promptPayQrPath: path, promptPayEnabled: true }));
    clearDirty('payments'); setFeedback('PromptPay QR saved and enabled.');
  }

  return <AdminPage title="Settings" subtitle="Business configuration grouped by operational category." actions={<Button label="Reload" variant="secondary" onPress={load} style={styles.headerButton} />}>
    {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
    {error ? <ErrorState message={error} onRetry={load} /> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.teal} /></View> : <View style={styles.settingsLayout}>
      <AdminCard style={styles.tabsCard}><AdminSectionTabs items={CATEGORIES.map((item) => ({ id: item.id, label: item.label, dirty: dirty.has(item.id) }))} value={category} onChange={(id) => chooseCategory(id as Category)} /></AdminCard>
      <View style={styles.settingsContent}>
        {category === 'business' ? <BusinessSection settings={settings} setSettings={updateBusinessSettings} saving={savingKey === 'business'} onSave={saveBusiness} /> : null}
        {category === 'slots' ? <SlotsSection slots={slots} update={updateSlot} save={saveSlot} fill={fillPickupSlots} savingKey={savingKey} /> : null}
        {category === 'services' ? <ServicesSection services={services} update={updateService} save={saveService} savingKey={savingKey} /> : null}
        {category === 'payments' ? <PaymentSection settings={settings} setSettings={updatePaymentSettings} upload={uploadPromptPayQr} save={savePayments} savingKey={savingKey} /> : null}
        {category === 'promotions' ? <PromotionsSection coupons={coupons} services={services} supportsAdvancedCoupons={couponSchemaFields.has('discount_target') && couponSchemaFields.has('eligible_service_ids')} newCode={newCouponCode} setNewCode={setNewCouponCode} create={createCoupon} update={updateCoupon} save={saveCoupon} remove={deleteCoupon} cancel={() => void load()} savingKey={savingKey} /> : null}
        {category === 'contact' ? <ContactSection settings={settings} setSettings={updateContactSettings} saving={savingKey === 'contact'} onSave={saveContact} /> : null}
      </View>
    </View>}
  </AdminPage>;
}

function BusinessSection({ settings, setSettings, saving, onSave }: { settings: BusinessSettings; setSettings: Dispatch<SetStateAction<BusinessSettings>>; saving: boolean; onSave: () => void }) {
  return <><SectionTitle title="Business" subtitle="Customer-facing store availability, service area, and fees" /><AdminCard style={styles.panel}><Field label="Store name" value={settings.storeName} onChangeText={(storeName) => setSettings((current) => ({ ...current, storeName }))} /><View style={styles.two}><Field label="Open time" value={settings.openTime.slice(0,5)} onChangeText={(openTime) => setSettings((current) => ({ ...current, openTime }))} style={styles.flex} /><Field label="Close time" value={settings.closeTime.slice(0,5)} onChangeText={(closeTime) => setSettings((current) => ({ ...current, closeTime }))} style={styles.flex} /></View><Text style={styles.label}>Store status override</Text><View style={styles.chips}>{(['automatic','open','closed'] as const).map((status) => <Pressable key={status} onPress={() => setSettings((current) => ({ ...current, manualStatus: status }))} style={[styles.chip, settings.manualStatus === status && styles.chipActive]}><Text style={[styles.chipText, settings.manualStatus === status && styles.chipTextActive]}>{status}</Text></Pressable>)}</View><View style={styles.two}><Field label="Pickup fee" value={String(settings.pickupFee)} onChangeText={(value) => setSettings((current) => ({ ...current, pickupFee: Number(value) || 0 }))} keyboardType="decimal-pad" style={styles.flex} /><Field label="Delivery fee" value={String(settings.deliveryFee)} onChangeText={(value) => setSettings((current) => ({ ...current, deliveryFee: Number(value) || 0 }))} keyboardType="decimal-pad" style={styles.flex} /></View><Field label="Service areas" value={settings.serviceAreas.join(', ')} onChangeText={(value) => setSettings((current) => ({ ...current, serviceAreas: value.split(',').map((item) => item.trim()).filter(Boolean) }))} multiline helper="Separate areas with commas." /><Button label="Save business settings" onPress={onSave} loading={saving} style={styles.saveButton} /></AdminCard></>;
}

function ContactSection({ settings, setSettings, saving, onSave }: { settings: BusinessSettings; setSettings: Dispatch<SetStateAction<BusinessSettings>>; saving: boolean; onSave: () => void }) {
  return <><SectionTitle title="Contact" subtitle="Information shown to customers when they need help" /><AdminCard style={styles.panel}><Field label="Business phone" value={settings.businessPhone} onChangeText={(businessPhone) => setSettings((current) => ({ ...current, businessPhone }))} keyboardType="phone-pad" /><Field label="LINE contact link" value={settings.lineUrl} onChangeText={(lineUrl) => setSettings((current) => ({ ...current, lineUrl }))} autoCapitalize="none" helper="Used by customer support actions where available." /><Button label="Save contact settings" onPress={onSave} loading={saving} style={styles.saveButton} /></AdminCard></>;
}

function SlotsSection({ slots, update, save, fill, savingKey }: { slots: PickupSlot[]; update: (id: string, patch: Partial<PickupSlot>) => void; save: (slot: PickupSlot) => void; fill: () => void; savingKey: string }) { const dates = [...new Set(slots.map((slot) => slot.date))]; return <><SectionTitle title="Pickup time slots" subtitle={`${slots.length} upcoming slots across ${dates.length} dates`} action={<Button label="Fill next 14 days" variant="secondary" onPress={fill} loading={savingKey === 'slots-fill'} style={styles.rowButton} />} />{dates.length ? <View style={styles.stack}>{dates.map((date) => <AdminCard key={date} style={styles.panel}><Text style={styles.panelTitle}>{date}</Text><View style={styles.slotTable}><View style={[styles.slotRow, styles.slotHeader]}><Text style={[styles.slotCell, styles.slotTimeCell]}>Time</Text><Text style={[styles.slotCell, styles.slotUsageCell]}>Booked</Text><Text style={[styles.slotCell, styles.slotCapacityCell]}>Capacity</Text><Text style={[styles.slotCell, styles.slotStateCell]}>Available</Text><Text style={[styles.slotCell, styles.slotActionCell]}>Action</Text></View>{slots.filter((slot) => slot.date === date).map((slot) => <View key={slot.id} style={styles.slotRow}><Text style={[styles.slotCellStrong, styles.slotTimeCell]}>{slot.startTime.slice(0,5)}–{slot.endTime.slice(0,5)}</Text><Text style={[styles.slotCell, styles.slotUsageCell]}>{slot.bookedCount}</Text><View style={styles.slotCapacityCell}><TextInput value={String(slot.capacity)} onChangeText={(value) => update(slot.id, { capacity: Number(value) || 0 })} keyboardType="number-pad" style={styles.capacityInput} /></View><View style={styles.slotStateCell}><Switch value={slot.enabled} onValueChange={(enabled) => update(slot.id, { enabled })} trackColor={{ true: Colors.tealLight }} thumbColor={slot.enabled ? Colors.teal : '#CBD5DB'} /></View><View style={styles.slotActionCell}><Button label="Save" variant="secondary" onPress={() => save(slot)} loading={savingKey === `slot-${slot.id}`} style={styles.rowButton} /></View></View>)}</View></AdminCard>)}</View> : <AdminCard><EmptyState title="No upcoming pickup slots" description="Restore the standard morning and afternoon schedule for the next 14 days using the button above." /></AdminCard>}</>; }

function ServicesSection({ services, update, save, savingKey }: { services: LaundryService[]; update: (id: string, patch: Partial<LaundryService>) => void; save: (service: LaundryService) => void; savingKey: string }) { return <><SectionTitle title="Services and prices" subtitle="Customer app catalog values remain connected to Supabase" /><View style={styles.stack}>{services.map((service) => <AdminCard key={service.id} style={styles.panel}><View style={styles.panelTop}><View style={styles.flex}><Text style={styles.panelTitle}>{service.name}</Text><Text style={styles.helper}>{service.description}</Text></View><View style={styles.enableWrap}><StatusBadge label={service.enabled ? 'Active' : 'Inactive'} tone={service.enabled ? 'green' : 'gray'} /><Switch value={service.enabled} onValueChange={(enabled) => update(service.id, { enabled })} trackColor={{ true: Colors.tealLight }} thumbColor={service.enabled ? Colors.teal : '#CBD5DB'} /></View></View><View style={styles.three}><Field label="Price" value={String(service.price)} onChangeText={(value) => update(service.id, { price: Number(value) || 0 })} keyboardType="decimal-pad" style={styles.flex} helper={formatBaht(service.price)} /><Field label="Pricing unit" value={service.priceUnit} onChangeText={(priceUnit) => update(service.id, { priceUnit })} style={styles.flex} /><Field label="Turnaround hours" value={String(service.turnaroundHours)} onChangeText={(value) => update(service.id, { turnaroundHours: Number(value) || 1 })} keyboardType="number-pad" style={styles.flex} /></View><Button label="Save service" variant="secondary" onPress={() => save(service)} loading={savingKey === `service-${service.id}`} style={styles.saveButton} /></AdminCard>)}</View></>; }

function PaymentSection({ settings, setSettings, upload, save, savingKey }: { settings: BusinessSettings; setSettings: Dispatch<SetStateAction<BusinessSettings>>; upload: () => void; save: () => void; savingKey: string }) { return <><SectionTitle title="Payment methods" subtitle="Cash collection and secure manual PromptPay confirmation" /><AdminCard style={styles.panel}><View style={styles.paymentMethod}><View><Text style={styles.panelTitle}>Cash at pickup</Text><Text style={styles.helper}>Stays Unpaid until staff confirms cash receipt.</Text></View><StatusBadge label="Enabled" tone="green" /></View><View style={styles.rule} /><View style={styles.paymentMethod}><View><Text style={styles.panelTitle}>Cash at delivery</Text><Text style={styles.helper}>Delivery and payment remain separate until staff records the cash.</Text></View><StatusBadge label="Enabled" tone="green" /></View><View style={styles.rule} /><View style={styles.paymentMethod}><View style={styles.flex}><Text style={styles.panelTitle}>PromptPay</Text><Text style={styles.helper}>Manual bank confirmation. No payment-provider webhook or verification API is configured.</Text></View><StatusBadge label={settings.promptPayEnabled && settings.promptPayQrPath ? 'Enabled' : 'Setup required'} tone={settings.promptPayEnabled && settings.promptPayQrPath ? 'green' : 'amber'} /></View><View style={styles.enableWrap}><Text style={styles.label}>Allow PromptPay at checkout</Text><Switch value={settings.promptPayEnabled} onValueChange={(promptPayEnabled) => setSettings((current) => ({ ...current, promptPayEnabled }))} trackColor={{ true: Colors.tealLight }} thumbColor={settings.promptPayEnabled ? Colors.teal : '#CBD5DB'} /></View><View style={styles.two}><Field label="Recipient display name" value={settings.promptPayDisplayName} onChangeText={(promptPayDisplayName) => setSettings((current) => ({ ...current, promptPayDisplayName }))} style={styles.flex} /><Field label="PromptPay number / identifier" value={settings.promptPayIdentifier} onChangeText={(promptPayIdentifier) => setSettings((current) => ({ ...current, promptPayIdentifier }))} style={styles.flex} /></View><Field label="Customer instruction" value={settings.promptPayInstructions} onChangeText={(promptPayInstructions) => setSettings((current) => ({ ...current, promptPayInstructions }))} multiline /><Field label="Attempt expiry (minutes)" value={String(settings.promptPayAttemptMinutes)} onChangeText={(value) => setSettings((current) => ({ ...current, promptPayAttemptMinutes: Number(value) || 15 }))} keyboardType="number-pad" helper="Between 5 and 60 minutes. A retry creates a new reference on the same order." /><View style={styles.two}><Button label={settings.promptPayQrPath ? 'Replace PromptPay QR' : 'Upload PromptPay QR'} variant="secondary" onPress={upload} loading={savingKey === 'promptpay'} style={styles.flex} /><Button label="Save payment settings" onPress={save} loading={savingKey === 'payments'} style={styles.flex} /></View></AdminCard></>; }

function PromotionsSection({
  coupons, services, supportsAdvancedCoupons, newCode, setNewCode, create, update, save, remove, cancel, savingKey,
}: {
  coupons: Coupon[];
  services: LaundryService[];
  supportsAdvancedCoupons: boolean;
  newCode: string;
  setNewCode: (value: string) => void;
  create: () => void;
  update: (code: string, patch: Partial<Coupon>) => void;
  save: (coupon: Coupon) => void;
  remove: (coupon: Coupon) => void;
  cancel: () => void;
  savingKey: string;
}) {
  const targets: { id: Coupon['discountTarget']; label: string }[] = [
    { id: 'service', label: 'Service subtotal' },
    { id: 'pickup_fee', label: 'Pickup fee' },
    { id: 'delivery_fee', label: 'Delivery fee' },
    { id: 'pickup_and_delivery', label: 'Pickup + delivery' },
  ];
  const methods: { id: Coupon['discountType']; label: string }[] = [
    { id: 'percentage', label: 'Percentage' },
    { id: 'fixed_amount', label: 'Fixed amount' },
    { id: 'free', label: 'Free fee' },
  ];

  return (
    <>
      <SectionTitle title="Coupons and promotions" subtitle="Rules, limits, eligibility, and activation" />
      {!supportsAdvancedCoupons ? (
        <AdminCard style={styles.panel}>
          <StatusBadge label="Legacy coupon database" tone="amber" />
          <Text style={styles.helper}>
            Service percentage, service fixed amount, and free pickup coupons can be saved now. Delivery, combined fees, caps, and multiple eligible services require the coupon migration.
          </Text>
        </AdminCard>
      ) : null}
      <AdminCard style={styles.createCoupon}>
        <Field label="New coupon code" value={newCode} onChangeText={setNewCode} autoCapitalize="characters" placeholder="WELCOME10" style={styles.flex} />
        <Button label="Create inactive coupon" variant="secondary" onPress={create} loading={savingKey === 'new-coupon'} style={styles.createButton} />
      </AdminCard>
      <View style={styles.stack}>
        {coupons.map((coupon) => {
          const status = couponStatus(coupon);
          const statusTone = status === 'Active' ? 'green' : status === 'Scheduled' ? 'blue' : status === 'Expired' || status === 'Exhausted' ? 'amber' : 'gray';
          return (
            <AdminCard key={coupon.code} style={styles.panel}>
              <View style={styles.panelTop}>
                <View>
                  <Text style={styles.couponCode}>{coupon.code}</Text>
                  <Text style={styles.helper}>{coupon.usageCount} successful uses</Text>
                </View>
                <View style={styles.enableWrap}>
                  <StatusBadge label={status} tone={statusTone} />
                  <Switch value={coupon.active} onValueChange={(active) => update(coupon.code, { active })} trackColor={{ true: Colors.tealLight }} thumbColor={coupon.active ? Colors.teal : '#CBD5DB'} />
                </View>
              </View>

              <Field label="Customer-facing title" value={coupon.title} onChangeText={(title) => update(coupon.code, { title })} />
              <Field label="Customer-facing description" value={coupon.description} onChangeText={(description) => update(coupon.code, { description })} multiline />

              <Text style={styles.label}>Discount target</Text>
              <View style={styles.chips}>
                {targets.map((target) => {
                  const disabled = !supportsAdvancedCoupons && (target.id === 'delivery_fee' || target.id === 'pickup_and_delivery');
                  return (
                    <Pressable
                      key={target.id}
                      disabled={disabled}
                      onPress={() => {
                        const legacyPickup = !supportsAdvancedCoupons && target.id === 'pickup_fee';
                        const serviceFromFree = target.id === 'service' && coupon.discountType === 'free';
                        update(coupon.code, {
                          discountTarget: target.id,
                          discountType: legacyPickup ? 'free' : serviceFromFree ? 'percentage' : coupon.discountType,
                          discountValue: legacyPickup ? 0 : serviceFromFree ? 100 : coupon.discountValue,
                        });
                      }}
                      style={[styles.chip, coupon.discountTarget === target.id && styles.chipActive, disabled && styles.disabled]}>
                      <Text style={[styles.chipText, coupon.discountTarget === target.id && styles.chipTextActive]}>{target.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Discount method</Text>
              <View style={styles.chips}>
                {methods.map((method) => {
                  const disabled = (method.id === 'free' && coupon.discountTarget === 'service')
                    || (!supportsAdvancedCoupons && coupon.discountTarget === 'pickup_fee' && method.id !== 'free');
                  return (
                    <Pressable
                      key={method.id}
                      disabled={disabled}
                      onPress={() => update(coupon.code, {
                        discountType: method.id,
                        discountValue: method.id === 'free' ? 0 : coupon.discountValue || (method.id === 'percentage' ? 10 : 50),
                        maxDiscount: method.id === 'percentage' ? coupon.maxDiscount : null,
                      })}
                      style={[styles.chip, coupon.discountType === method.id && styles.chipActive, disabled && styles.disabled]}>
                      <Text style={[styles.chipText, coupon.discountType === method.id && styles.chipTextActive]}>{method.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {coupon.discountType !== 'free' ? (
                <View style={styles.two}>
                  <Field
                    label={coupon.discountType === 'percentage' ? 'Percentage value' : 'Fixed amount'}
                    value={String(coupon.discountValue)}
                    onChangeText={(value) => update(coupon.code, { discountValue: Number(value) || 0 })}
                    keyboardType="decimal-pad"
                    style={styles.flex}
                  />
                  {coupon.discountType === 'percentage' && supportsAdvancedCoupons ? (
                    <Field
                      label="Maximum discount (optional)"
                      value={coupon.maxDiscount == null ? '' : String(coupon.maxDiscount)}
                      onChangeText={(value) => update(coupon.code, { maxDiscount: value ? Number(value) : null })}
                      keyboardType="decimal-pad"
                      style={styles.flex}
                    />
                  ) : null}
                </View>
              ) : <Text style={styles.helper}>The selected fee target will be discounted in full.</Text>}

              <Field label="Minimum service subtotal" value={String(coupon.minimumOrder)} onChangeText={(value) => update(coupon.code, { minimumOrder: Number(value) || 0 })} keyboardType="decimal-pad" />

              <Text style={styles.label}>Eligible services</Text>
              <View style={styles.chips}>
                <Pressable onPress={() => update(coupon.code, { eligibleServiceIds: [], serviceId: null })} style={[styles.chip, !coupon.eligibleServiceIds.length && styles.chipActive]}>
                  <Text style={[styles.chipText, !coupon.eligibleServiceIds.length && styles.chipTextActive]}>All services</Text>
                </Pressable>
                {services.map((service) => {
                  const selected = coupon.eligibleServiceIds.includes(service.id);
                  return (
                    <Pressable
                      key={service.id}
                      onPress={() => {
                        const ids = selected
                          ? coupon.eligibleServiceIds.filter((id) => id !== service.id)
                          : supportsAdvancedCoupons ? [...coupon.eligibleServiceIds, service.id] : [service.id];
                        update(coupon.code, { eligibleServiceIds: ids, serviceId: ids[0] || null });
                      }}
                      style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{service.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.two}>
                <Field label="Starts at" value={coupon.startsAt || ''} onChangeText={(startsAt) => update(coupon.code, { startsAt })} placeholder="2026-07-19T08:00:00+07:00" autoCapitalize="none" style={styles.flex} />
                <Field label="Ends at" value={coupon.expiresAt || ''} onChangeText={(expiresAt) => update(coupon.code, { expiresAt })} placeholder="2026-12-31T23:59:00+07:00" autoCapitalize="none" style={styles.flex} />
              </View>
              <View style={styles.two}>
                <Field label="Per-customer limit" value={coupon.perCustomerLimit == null ? '' : String(coupon.perCustomerLimit)} onChangeText={(value) => update(coupon.code, { perCustomerLimit: value ? Number(value) : null })} keyboardType="number-pad" style={styles.flex} />
                <Field label="Total redemption limit" value={coupon.totalUsageLimit == null ? '' : String(coupon.totalUsageLimit)} onChangeText={(value) => update(coupon.code, { totalUsageLimit: value ? Number(value) : null })} keyboardType="number-pad" style={styles.flex} />
              </View>

              {supportsAdvancedCoupons ? (
                <View style={styles.paymentMethod}>
                  <View>
                    <Text style={styles.panelTitle}>New-customer-only</Text>
                    <Text style={styles.helper}>Limit this coupon to the customer’s first successful use.</Text>
                  </View>
                  <Switch value={coupon.firstVerifiedProfileOnly} onValueChange={(firstVerifiedProfileOnly) => update(coupon.code, { firstVerifiedProfileOnly })} trackColor={{ true: Colors.tealLight }} thumbColor={coupon.firstVerifiedProfileOnly ? Colors.teal : '#CBD5DB'} />
                </View>
              ) : null}

              <View style={styles.two}>
                <Button label="Save coupon" variant="secondary" onPress={() => save(coupon)} loading={savingKey === 'coupon-' + coupon.code} style={styles.flex} />
                <Button label="Cancel changes" variant="ghost" onPress={cancel} disabled={Boolean(savingKey)} style={styles.flex} />
                <Button
                  label="Delete coupon"
                  variant="ghost"
                  onPress={() => remove(coupon)}
                  loading={savingKey === 'coupon-delete-' + coupon.code}
                  style={styles.flex}
                />
              </View>
            </AdminCard>
          );
        })}
      </View>
    </>
  );
}

function Field({ label, helper, style, ...props }: { label: string; helper?: string; style?: StyleProp<ViewStyle> } & Omit<ComponentProps<typeof TextInput>, 'style'>) { return <View style={style}><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor={Colors.textMuted} style={[styles.input, props.multiline && styles.area]} />{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>; }

const styles = StyleSheet.create({
  headerButton: { minHeight: 40, paddingHorizontal: 14 }, feedback: { alignSelf: 'flex-end', backgroundColor: Colors.successLight, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 10 }, feedbackText: { color: Colors.success, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, loading: { minHeight: 500, alignItems: 'center', justifyContent: 'center' }, settingsLayout: { gap: 17 }, tabsCard: { padding: 7 }, settingsContent: { width: '100%', maxWidth: 1040, alignSelf: 'center' }, panel: { padding: 18 }, stack: { gap: 12 }, panelTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' }, panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, enableWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 }, label: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }, input: { minHeight: 43, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.canvas, color: Colors.text, fontFamily: FontFamily, fontSize: 10.5, paddingHorizontal: 11 }, area: { minHeight: 76, paddingTop: 10, textAlignVertical: 'top' }, helper: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5, lineHeight: 14, marginTop: 4 }, two: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, three: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, flex: { flex: 1, minWidth: 140 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 36, borderWidth: 0, backgroundColor: '#EEF3F2', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 11 }, chipActive: { backgroundColor: Colors.navy }, chipText: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500', textTransform: 'capitalize' }, chipTextActive: { color: Colors.surface }, disabled: { opacity: 0.45 }, saveButton: { minHeight: 42, alignSelf: 'flex-start', paddingHorizontal: 14, marginTop: 5 },
  slotTable: { marginTop: 10, borderWidth: 1, borderColor: Colors.line, borderRadius: Radius.medium, overflow: 'hidden' }, slotRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: Colors.line }, slotHeader: { minHeight: 36, backgroundColor: '#F0F5F4' }, slotCell: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5 }, slotCellStrong: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500' }, slotTimeCell: { flex: 1.5 }, slotUsageCell: { flex: 0.8 }, slotCapacityCell: { flex: 1 }, slotStateCell: { flex: 1 }, slotActionCell: { flex: 1 }, capacityInput: { width: 70, height: 36, borderWidth: 1, borderColor: Colors.line, borderRadius: 10, color: Colors.text, fontFamily: FontFamily, paddingHorizontal: 8, backgroundColor: Colors.surface, fontSize: 9.5 }, rowButton: { minHeight: 34, paddingHorizontal: 10 }, paymentMethod: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, rule: { height: 1, backgroundColor: Colors.line }, createCoupon: { padding: 15, flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 11 }, createButton: { minHeight: 42, paddingHorizontal: 12 }, couponCode: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 15, fontWeight: '500', letterSpacing: 0.8 },
});
