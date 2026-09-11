import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckoutField, CheckoutProgress, CheckoutSectionTitle, ChoiceChips } from '@/components/customer-checkout';
import { AddressSelector, CompactScreenHeader, ConfirmationModal, CouponSelector, CustomerCard, ExpandableDetailSection, InformationBanner, InlineError, PaymentSelector, PickupSlotSelector, PriceBreakdown, QuantityControl, SelectionCheck, StickyActionBar } from '@/components/customer-ui';
import { SymbolView, type SymbolName } from '@/components/symbol';
import { CustomerColors as C, CustomerLayout, CustomerRadius, CustomerSpace as S, CustomerType } from '@/constants/customer-design';
import { FontFamilyMedium } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { type CheckoutDraft, isCheckoutDraftEmpty, useCheckoutDraft } from '@/hooks/use-checkout-draft';
import { formatBaht, pickupSlotLabel } from '@/lib/domain';
import { allowedRouteParam, calculateCouponDiscount, claimSubmission, couponTargetLabel, freePickupDiscount, isCouponOrderEligible } from '@/lib/customer-rules';
import { servicePalette, serviceSymbol } from '@/lib/icons';
import type { CollectionMethod, Coupon, LaundryService, PaymentMethod, PickupSlot, ReturnMethod, ServiceOption } from '@/types/domain';

const STEPS = ['Services', 'Preferences', 'Fulfillment', 'Review & Payment'];
const MAX_QUANTITY = 20;
const ORDER_NOTE_MAX_LENGTH = 1000;
type T = (key: string, values?: Record<string, string | number>) => string;

export default function NewOrderScreen() {
  const params = useLocalSearchParams<{ service?: string; coupon?: string; repeatOrderId?: string; fulfillment?: string }>();
  const app = useApp();
  const { addresses, businessSettings, coupons, customerEligibility, isDemo, language, orders, pickupSlots, primaryAddressId, profile, refresh, services, t } = app;
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [preferences, setPreferences] = useState<Record<string, Record<string, unknown>>>({});
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('home_pickup');
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>('home_delivery');
  const [addressId, setAddressId] = useState(primaryAddressId);
  const [newAddressOpen, setNewAddressOpen] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: '', detail: '' });
  const [slotId, setSlotId] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [phone, setPhone] = useState(profile.phone);
  const [instructions, setInstructions] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>(app.paymentMethod);
  const [couponCode, setCouponCode] = useState(params.coupon || '');
  const [allCoupons, setAllCoupons] = useState(false);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const submitLock = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const enabledServices = useMemo(() => services.filter((service) => service.enabled), [services]);
  const inactiveSelectedIds = useMemo(() => services.filter((service) => !service.enabled && (selected[service.id] || 0) > 0).map((service) => service.id), [selected, services]);
  const validSlots = useMemo(() => pickupSlots.filter((slot) => slot.enabled && slot.bookedCount < slot.capacity && new Date(`${slot.date}T${slot.endTime}+07:00`).getTime() > Date.now()), [pickupSlots]);
  const dates = useMemo(() => [...new Set(validSlots.map((slot) => slot.date))].sort(), [validSlots]);
  const chosenServices = enabledServices.filter((service) => (selected[service.id] || 0) > 0);
  const items = chosenServices.map((service) => ({ serviceId: service.id, quantity: selected[service.id], preferences: preferences[service.id] || {} }));
  const subtotal = chosenServices.reduce((sum, service) => sum + service.price * selected[service.id], 0);
  const coupon = coupons.find((item) => item.code === couponCode);
  const pickupFee = collectionMethod === 'home_pickup' ? businessSettings.pickupFee : 0;
  const deliveryFee = returnMethod === 'home_delivery' ? businessSettings.deliveryFee : 0;
  const pickupBenefitDiscount = collectionMethod === 'home_pickup' ? freePickupDiscount(pickupFee, customerEligibility.remainingFreePickups, isDemo) : 0;
  const couponError = coupon ? isCouponOrderEligible(coupon, subtotal, selected, Date.now(), { pickupFee: Math.max(0, pickupFee - pickupBenefitDiscount), deliveryFee }, services) : couponCode ? 'Coupon not found.' : '';
  const couponDiscountValue = coupon && !couponError ? calculateCouponDiscount(coupon, subtotal, Math.max(0, pickupFee - pickupBenefitDiscount), deliveryFee, services, selected) : 0;
  const discount = pickupBenefitDiscount + couponDiscountValue;
  const total = Math.max(0, subtotal + pickupFee + deliveryFee - discount);
  const estimated = chosenServices.some((service) => service.pricingType === 'estimated');
  const requiredPreferencesComplete = chosenServices.every((service) => service.options
    .filter((item) => item.required)
    .every((item) => { const value = preferences[service.id]?.[item.optionKey]; return value !== undefined && value !== null && value !== ''; }));
  const needsAddress = collectionMethod === 'home_pickup' || returnMethod === 'home_delivery';
  const addressComplete = !needsAddress || Boolean(addressId || (newAddress.label.trim() && newAddress.detail.trim()));
  const phoneComplete = isDemo || /^\+?[0-9 ()-]{8,20}$/.test(phone.trim());
  const pickupTimeComplete = collectionMethod !== 'home_pickup' || Boolean(slotId && validSlots.some((slot) => slot.id === slotId));
  const canContinue = step === 1 ? items.length > 0
    : step === 2 ? requiredPreferencesComplete
      : step === 3 ? addressComplete && phoneComplete && pickupTimeComplete
        : comment.trim().length <= ORDER_NOTE_MAX_LENGTH && !Boolean(couponCode && couponError);

  const draft = useMemo<CheckoutDraft>(() => ({ version: 3, savedAt: new Date().toISOString(), selected, servicePreferences: preferences, collectionMethod, returnMethod, addressId, newAddress, pickupSlotId: slotId, pickupInstructions: instructions, contactPhone: phone, paymentMethod: payment, couponCode, customerComment: comment, step, photoReferences: photos }), [addressId, collectionMethod, comment, couponCode, instructions, newAddress, payment, phone, photos, preferences, returnMethod, selected, slotId, step]);
  const { savedDraft, setSavedDraft, ready, clearDraft } = useCheckoutDraft(draft, draftEnabled);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (ready && !savedDraft) setDraftEnabled(true); }, [ready, savedDraft]);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useEffect(() => { if (!addressId && primaryAddressId) setAddressId(primaryAddressId); if (!phone && profile.phone) setPhone(profile.phone); }, [addressId, phone, primaryAddressId, profile.phone]);
  useEffect(() => { if (!slotDate && dates[0]) setSlotDate(dates[0]); if (slotId && !validSlots.some((slot) => slot.id === slotId)) setSlotId(''); }, [dates, slotDate, slotId, validSlots]);
  useEffect(() => {
    if (returnMethod === 'home_delivery' && payment === 'cash_pickup') setPayment('cash_delivery');
    if (returnMethod === 'store_collection' && payment === 'cash_delivery') setPayment('cash_pickup');
  }, [payment, returnMethod]);
  useEffect(() => {
    if (!draftEnabled) return;
    const routedService = allowedRouteParam(params.service, enabledServices.map((service) => service.id));
    const routedCoupon = allowedRouteParam(params.coupon, coupons.map((couponItem) => couponItem.code));
    if (routedService) setSelected((current) => ({ ...current, [routedService]: Math.max(1, current[routedService] || 0) }));
    if (params.coupon) setCouponCode(routedCoupon);
    if (params.fulfillment === 'store_dropoff') setCollectionMethod('store_dropoff');
    const repeat = orders.find((order) => order.databaseId === params.repeatOrderId);
    if (repeat) { const enabledIds = new Set(enabledServices.map((service) => service.id)); const validItems = repeat.items.filter((item) => enabledIds.has(item.serviceId)); setSelected(Object.fromEntries(validItems.map((item) => [item.serviceId, Math.min(item.quantity, MAX_QUANTITY)]))); setPreferences(Object.fromEntries(validItems.map((item) => [item.serviceId, item.preferences]))); if (validItems.length !== repeat.items.length) setErrors((current) => ({ ...current, services: t('This service is temporarily unavailable.') })); setCollectionMethod(repeat.collectionMethod); setReturnMethod(repeat.returnMethod); setInstructions(repeat.pickupInstructions); setComment(repeat.customerComment); setPayment(repeat.paymentMethod); }
  }, [coupons, draftEnabled, enabledServices, orders, params.coupon, params.fulfillment, params.repeatOrderId, params.service, t]);
  useEffect(() => {
    if (couponCode && !coupon) { setCouponCode(''); setErrors((current) => ({ ...current, coupon: t('This offer is no longer available.') })); }
  }, [coupon, couponCode, t]);
  useEffect(() => {
    if (!inactiveSelectedIds.length) return;
    const unavailable = new Set(inactiveSelectedIds);
    setSelected((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !unavailable.has(id))));
    setPreferences((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !unavailable.has(id))));
    setErrors((current) => ({ ...current, services: t('This service is temporarily unavailable.') }));
  }, [inactiveSelectedIds, t]);

  function restore(saved: CheckoutDraft) {
    const serviceIds = new Set(enabledServices.map((service) => service.id));
    const removedInactiveService = Object.entries(saved.selected).some(([id, quantity]) => !serviceIds.has(id) && quantity > 0);
    setSelected(Object.fromEntries(Object.entries(saved.selected).filter(([id, quantity]) => serviceIds.has(id) && quantity > 0)));
    setPreferences(Object.fromEntries(Object.entries(saved.servicePreferences).filter(([id]) => serviceIds.has(id))));
    setCollectionMethod(saved.collectionMethod); setReturnMethod(saved.returnMethod);
    setAddressId(addresses.some((item) => item.id === saved.addressId) ? saved.addressId : primaryAddressId);
    setNewAddress(saved.newAddress); setNewAddressOpen(Boolean(saved.newAddress.label || saved.newAddress.detail));
    setSlotId(validSlots.some((slot) => slot.id === saved.pickupSlotId) ? saved.pickupSlotId : '');
    setInstructions(saved.pickupInstructions); setInstructionsOpen(Boolean(saved.pickupInstructions)); setPhone(saved.contactPhone || profile.phone);
    setPayment(saved.paymentMethod); setCouponCode(coupons.some((item) => item.code === saved.couponCode) ? saved.couponCode : ''); if (saved.couponCode && !coupons.some((item) => item.code === saved.couponCode)) setErrors((current) => ({ ...current, coupon: t('COUPON_INVALID') })); if (removedInactiveService) setErrors((current) => ({ ...current, services: t('This service is temporarily unavailable.') })); setComment(saved.customerComment); setPhotos(saved.photoReferences || []); setStep(Math.min(4, Math.max(1, saved.step)));
    setSavedDraft(null); setDraftEnabled(true);
  }

  function quantity(id: string, change: number) { setSelected((current) => ({ ...current, [id]: Math.max(0, Math.min(MAX_QUANTITY, (current[id] || 0) + change)) })); setErrors((current) => ({ ...current, services: '' })); }
  function option(serviceId: string, key: string, value: unknown) {
    const previous = preferences[serviceId]?.[key];
    setPreferences((current) => ({ ...current, [serviceId]: { ...(current[serviceId] || {}), [key]: value } }));
    if (typeof previous === 'string' && previous !== value && photos.includes(previous)) {
      setPhotos((current) => current.filter((uri) => uri !== previous));
    }
    if (typeof value === 'string' && value && isLocalPhotoUri(value)) {
      setPhotos((current) => [...new Set([...current, value])]);
    }
    setErrors((current) => ({ ...current, [`${serviceId}.${key}`]: '' }));
  }
  async function photo(serviceId: string, setting: ServiceOption) { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { setErrors((current) => ({ ...current, [`${serviceId}.${setting.optionKey}`]: t('PHOTO_PERMISSION_REQUIRED') })); return; } const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 }); const asset = result.canceled ? null : result.assets[0]; if (asset) option(serviceId, setting.optionKey, asset.uri); }

  async function next() {
    if (inactiveSelectedIds.length) { setErrors({ services: t('This service is temporarily unavailable.') }); return; }
    if (step === 1 && !items.length) { setErrors({ services: t('Select at least one service to continue.') }); return; }
    if (step === 2) { const missing: Record<string, string> = {}; chosenServices.forEach((service) => service.options.filter((item) => item.required).forEach((item) => { const value = preferences[service.id]?.[item.optionKey]; if (value === undefined || value === null || value === '') missing[`${service.id}.${item.optionKey}`] = t('This field is required.'); })); if (Object.keys(missing).length) { setErrors(missing); return; } }
    if (step === 3) { const nextErrors: Record<string, string> = {}; const needsAddress = collectionMethod === 'home_pickup' || returnMethod === 'home_delivery'; if (needsAddress && !addressId && (!newAddress.label.trim() || !newAddress.detail.trim())) nextErrors.address = t('Choose a saved address or enter a new one.'); if (!isDemo && !/^\+?[0-9 ()-]{8,20}$/.test(phone.trim())) nextErrors.phone = t('Enter a valid phone number.'); if (collectionMethod === 'home_pickup' && (!slotId || !validSlots.some((slot) => slot.id === slotId))) nextErrors.slot = t('Select an available pickup slot.'); if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; } if (needsAddress && !addressId) { try { const created = await app.addAddress({ label: newAddress.label.trim(), detail: newAddress.detail.trim() }); setAddressId(created.id); } catch (error) { setErrors({ address: t(error instanceof Error ? error.message : 'UNKNOWN_ERROR') }); return; } } }
    if (step === 4 && comment.trim().length > ORDER_NOTE_MAX_LENGTH) { setErrors({ submit: t('Keep the customer order note under 1000 characters.') }); return; }
    setErrors({}); setStep((value) => Math.min(4, value + 1));
  }

  async function submit() {
    if (submitting || !claimSubmission(submitLock)) return;
    if (comment.trim().length > ORDER_NOTE_MAX_LENGTH) { setErrors({ submit: t('Keep the customer order note under 1000 characters.') }); submitLock.current = false; return; }
    if (inactiveSelectedIds.length) { setErrors({ submit: t('This service is temporarily unavailable.') }); submitLock.current = false; return; }
    if (couponCode && couponError) { setCouponCode(''); setErrors({ submit: t('This offer is no longer available.') }); submitLock.current = false; return; }
    const needsAddress = collectionMethod === 'home_pickup' || returnMethod === 'home_delivery';
    if (!items.length || (needsAddress && !addressId) || (collectionMethod === 'home_pickup' && (!slotId || !validSlots.some((slot) => slot.id === slotId)))) { setErrors({ submit: t('Review the highlighted order details and try again.') }); submitLock.current = false; return; }
    setSubmitting(true); setErrors({});
    try {
      const result = await app.placeOrder({ items, preferences, collectionMethod, returnMethod, pickupSlotId: collectionMethod === 'home_pickup' ? slotId : undefined, addressId: needsAddress ? addressId : undefined, pickupInstructions: instructions.trim(), contactPhone: phone.trim(), paymentMethod: payment, couponCode: coupon && !couponError ? couponCode : undefined, customerComment: comment.trim(), isDemo });
      if (photos.length) await Promise.allSettled(photos.map((uri) => app.uploadOrderFile(result.databaseId, 'stain_photo', { uri })));
      await clearDraft();
      const chosenSlot = validSlots.find((slot) => slot.id === slotId); const address = addresses.find((item) => item.id === addressId);
      router.replace({ pathname: '/order-success', params: { orderId: result.databaseId, orderNumber: result.id, total: String(result.amount), pickup: chosenSlot && collectionMethod === 'home_pickup' ? pickupSlotLabel(chosenSlot, language) : t('Store drop-off'), address: address?.detail || newAddress.detail } });
    } catch (error) { const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR'; if (code.includes('COUPON_')) setCouponCode(''); setErrors({ submit: t(code.includes('COUPON_') ? 'This offer is no longer available.' : code) }); }
    finally { setSubmitting(false); submitLock.current = false; }
  }

  if (profile.role === 'admin') return <Redirect href={'/admin' as Href} />;
  if (profile.role === 'driver') return <Redirect href={'/driver' as Href} />;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><CompactScreenHeader title={t('New order')} onBack={step > 1 ? () => setStep(step - 1) : () => router.back()} onClose={() => isCheckoutDraftEmpty(draft) ? router.back() : setCloseOpen(true)} /></View>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><CheckoutProgress step={step} names={STEPS.map((name) => t(name))} /><Text style={styles.stepEyebrow}>{t('STEP {{current}} OF 4', { current: step })}</Text>{isDemo ? <InformationBanner title={t('Demo mode')} message={t('No real pickup, payment, or delivery will occur.')} icon={{ ios: 'info.circle.fill', android: 'info', web: 'info' }} tone="info" /> : null}
      {step === 1 ? <ServiceStep services={enabledServices} selected={selected} quantity={quantity} error={errors.services} t={t} /> : null}
      {step === 2 ? <PreferenceStep services={chosenServices} values={preferences} errors={errors} update={option} choosePhoto={photo} t={t} /> : null}
      {step === 3 ? <FulfillmentStep collectionMethod={collectionMethod} setCollectionMethod={setCollectionMethod} returnMethod={returnMethod} setReturnMethod={setReturnMethod} addresses={addresses} addressId={addressId} setAddressId={setAddressId} newAddressOpen={newAddressOpen} setNewAddressOpen={setNewAddressOpen} newAddress={newAddress} setNewAddress={setNewAddress} phone={phone} setPhone={setPhone} phoneEditable dates={dates} slotDate={slotDate} setSlotDate={setSlotDate} slots={validSlots} slotId={slotId} setSlotId={setSlotId} instructionsOpen={instructionsOpen} setInstructionsOpen={setInstructionsOpen} instructions={instructions} setInstructions={setInstructions} errors={errors} language={language} supportPhone={businessSettings.businessPhone} storeName={businessSettings.storeName} storeHours={`${businessSettings.openTime.slice(0,5)}–${businessSettings.closeTime.slice(0,5)}`} t={t} /> : null}
      {step === 4 ? <View><ReviewStep services={chosenServices} selected={selected} preferences={preferences} collectionMethod={collectionMethod} returnMethod={returnMethod} address={addresses.find((item) => item.id === addressId)?.detail || newAddress.detail} slot={validSlots.find((item) => item.id === slotId)} language={language} phone={phone} comment={comment} setComment={setComment} edit={setStep} t={t} /><View style={styles.combinedPayment}><PaymentStep payment={payment} setPayment={setPayment} returnMethod={returnMethod} coupons={coupons} couponCode={couponCode} setCouponCode={(value) => { setCouponCode(value); setErrors((current) => ({ ...current, coupon: '' })); }} couponError={errors.coupon || couponError} allCoupons={allCoupons} setAllCoupons={setAllCoupons} subtotal={subtotal} pickupFee={pickupFee} deliveryFee={deliveryFee} discount={discount} pickupBenefitDiscount={pickupBenefitDiscount} total={total} selected={selected} services={services} couponTarget={coupon && !couponError ? couponTargetLabel(coupon) : ''} estimated={estimated} submitError={errors.submit} t={t} /></View></View> : null}
    </ScrollView>
    <StickyActionBar totalLabel={t(estimated ? 'Estimated total' : 'Total')} total={items.length ? formatBaht(total) : t('Select an item')} actionLabel={t(step === 4 ? 'Place order' : 'Continue')} onAction={step === 4 ? () => void submit() : () => void next()} loading={submitting} disabled={submitting || !canContinue} />
  </KeyboardAvoidingView>
  <ConfirmationModal visible={Boolean(savedDraft && !draftEnabled)} title={t('Continue your order?')} message={t('We found an unfinished checkout. Continue where you left off or discard it.')} confirmLabel={t('Continue draft')} cancelLabel={t('Discard')} onConfirm={() => savedDraft && restore(savedDraft)} onCancel={() => { void clearDraft(); setSavedDraft(null); setDraftEnabled(true); }} />
  <ConfirmationModal visible={closeOpen} title={t('Leave checkout?')} message={t('Your progress is saved. You can continue this order later.')} confirmLabel={t('Leave')} cancelLabel={t('Keep editing')} onConfirm={() => router.back()} onCancel={() => setCloseOpen(false)} />
  </SafeAreaView>;
}

function ServiceStep({ services, selected, quantity, error, t }: { services: LaundryService[]; selected: Record<string, number>; quantity: (id: string, change: number) => void; error?: string; t: T }) { return <View><CheckoutSectionTitle title={t('What needs care?')} helper={t('Choose your services. You can select more than one.')} /><InformationBanner title={t('No scale needed')} message={t('One everyday laundry bag is usually 5–7 kg.')} icon={{ ios: 'bag', android: 'shopping-outline', web: 'shopping-outline' }} tone="info" />{services.length ? <CustomerCard style={styles.serviceList}>{services.map((service, index) => { const count = selected[service.id] || 0; const palette = servicePalette(service.icon); return <View key={service.id}><View style={[styles.service, count > 0 && styles.chosen]}><View style={[styles.serviceIcon, { backgroundColor: palette.background }]}><SymbolView name={serviceSymbol(service.icon)} size={20} tintColor={palette.color} /></View><View style={styles.copy}><Text style={styles.title}>{t(service.nameKey)}</Text><Text style={styles.muted}>{t('From {{price}} / {{unit}}', { price: formatBaht(service.price), unit: t(service.priceUnit) })} · {t('{{hours}}h', { hours: service.turnaroundHours })}</Text></View>{count > 0 ? <SelectionCheck selected /> : null}<QuantityControl label={t(service.nameKey)} value={count} onMinus={() => quantity(service.id, -1)} onPlus={() => quantity(service.id, 1)} maximumReached={count >= MAX_QUANTITY} /></View>{index < services.length - 1 ? <View style={styles.serviceDivider} /> : null}</View>; })}</CustomerCard> : <CustomerCard><Text style={styles.title}>{t('Services are temporarily unavailable')}</Text><Text style={styles.muted}>{t('Super Shine is not accepting service selections right now. Please check back later or contact support.')}</Text></CustomerCard>}<InlineError message={error} /></View>; }

function PreferenceStep({ services, values, errors, update, choosePhoto, t }: { services: LaundryService[]; values: Record<string, Record<string, unknown>>; errors: Record<string, string>; update: (id: string, key: string, value: unknown) => void; choosePhoto: (id: string, option: ServiceOption) => Promise<void>; t: T }) { return <View><CheckoutSectionTitle title={t('How should we care for it?')} helper={t('Only preferences related to your services are shown.')} /><InformationBanner title={t('Everyday care profile')} message={t('Your choices here can be reused on your next order.')} icon={{ ios: 'heart', android: 'heart-outline', web: 'heart-outline' }} /><View style={styles.stack}>{services.map((service) => { const palette = servicePalette(service.icon); return <CustomerCard key={service.id} style={styles.form}><View style={styles.preferenceHeader}><View style={[styles.serviceIcon, { backgroundColor: palette.background }]}><SymbolView name={serviceSymbol(service.icon)} size={23} tintColor={palette.color} /></View><View style={styles.copy}><Text style={styles.section}>{t(service.nameKey)}</Text><Text style={styles.muted}>{t(service.descriptionKey)}</Text></View></View>{service.options.map((setting) => <Option key={setting.id} serviceId={service.id} setting={setting} value={values[service.id]?.[setting.optionKey]} error={errors[`${service.id}.${setting.optionKey}`]} update={update} choosePhoto={choosePhoto} t={t} />)}{!service.options.length ? <Text style={styles.muted}>{t('No extra preferences are required for this service.')}</Text> : null}</CustomerCard>; })}</View></View>; }

function preferencePresentation(setting: ServiceOption, t: T): { icon: SymbolName; helper: string } {
  const options: Record<string, { icon: SymbolName; helper: string }> = {
    detergent: { icon: { ios: 'waterbottle.fill', android: 'bottle-tonic-outline', web: 'bottle-tonic-outline' }, helper: t('Choose the detergent we use.') },
    fabric_softener: { icon: { ios: 'sparkles', android: 'flower-outline', web: 'flower-outline' }, helper: t('Add extra softness to your clothes.') },
    fragrance_free: { icon: { ios: 'leaf.fill', android: 'leaf-off', web: 'leaf-off' }, helper: t('Wash without added fragrance.') },
    wash_temperature: { icon: { ios: 'thermometer.medium', android: 'thermometer', web: 'thermometer' }, helper: t('Choose the wash temperature.') },
    folding: { icon: { ios: 'tshirt.fill', android: 'tshirt-crew-outline', web: 'tshirt-crew-outline' }, helper: t('Choose how we fold your laundry.') },
    hanger: { icon: { ios: 'hanger', android: 'hanger', web: 'hanger' }, helper: t('Keep finished items ready to wear.') },
  };
  return options[setting.optionKey] ?? { icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }, helper: t('Choose your preferred option.') };
}

function PreferenceIntro({ setting, label, t }: { setting: ServiceOption; label: string; t: T }) {
  const presentation = preferencePresentation(setting, t);
  return <View style={styles.preferenceIntro}><View style={styles.preferenceIcon}><SymbolView name={presentation.icon} size={22} tintColor={C.tealPressed} /></View><View style={styles.preferenceCopy}><Text style={styles.preferenceLabel}>{label}</Text><Text style={styles.preferenceHelper}>{presentation.helper}</Text></View></View>;
}

function Option({ serviceId, setting, value, error, update, choosePhoto, t }: { serviceId: string; setting: ServiceOption; value: unknown; error?: string; update: (id: string, key: string, value: unknown) => void; choosePhoto: (id: string, option: ServiceOption) => Promise<void>; t: T }) {
  const label = t(setting.labelKey);
  const translateChoice = (choice: string) => t(`option.${choice === 'customer_own' ? 'customer_supplied' : choice}`);
  if (setting.inputType === 'boolean') return <View><View style={styles.preferenceOption}><PreferenceIntro setting={setting} label={label} t={t} /><View style={styles.preferenceSwitch}><Text style={styles.switchState}>{t(Boolean(value) ? 'Yes, please' : 'No thanks')}</Text><Switch accessibilityLabel={label} value={Boolean(value)} onValueChange={(next) => update(serviceId, setting.optionKey, next)} trackColor={{ false: C.disabledSoft, true: C.teal }} thumbColor={C.white} /></View></View><InlineError message={error} /></View>;
  if (setting.inputType === 'select') return <View><View style={styles.preferenceOption}><PreferenceIntro setting={setting} label={label} t={t} /><View style={styles.preferenceControl}><ChoiceChips value={typeof value === 'string' ? value : ''} choices={setting.choices} onChange={(next) => update(serviceId, setting.optionKey, next)} translate={translateChoice} /></View></View><InlineError message={error} /></View>;
  if (setting.inputType === 'photo') {
    const uri = typeof value === 'string' ? value : '';
    return <View><View style={styles.preferenceOption}><PreferenceIntro setting={setting} label={label} t={t} /><View style={styles.preferenceControl}>{uri ? <View style={styles.photoRow}><Image source={{ uri }} style={styles.photo} /><View><Pressable onPress={() => void choosePhoto(serviceId, setting)} style={styles.link}><Text style={styles.linkText}>{t('Replace photo')}</Text></Pressable><Pressable onPress={() => update(serviceId, setting.optionKey, '')} style={styles.link}><Text style={[styles.linkText, { color: C.error }]}>{t('Remove')}</Text></Pressable></View></View> : <Pressable onPress={() => void choosePhoto(serviceId, setting)} style={styles.photoPicker}><SymbolView name={{ ios: 'camera.fill', android: 'add_a_photo', web: 'add_a_photo' }} size={20} tintColor={C.tealPressed} /><Text style={styles.linkText}>{t('Add photo')}</Text></Pressable>}</View></View><InlineError message={error} /></View>;
  }
  return <View><View style={styles.preferenceOption}><PreferenceIntro setting={setting} label={label} t={t} /><View style={styles.preferenceControl}><CheckoutField label="" value={typeof value === 'string' ? value : ''} onChangeText={(next) => update(serviceId, setting.optionKey, next)} multiline /></View></View><InlineError message={error} /></View>;
}

type FulfillmentProps = {
  collectionMethod: CollectionMethod; setCollectionMethod: (value: CollectionMethod) => void;
  returnMethod: ReturnMethod; setReturnMethod: (value: ReturnMethod) => void;
  addresses: { id: string; label: string; detail: string }[]; addressId: string; setAddressId: (id: string) => void;
  newAddressOpen: boolean; setNewAddressOpen: (value: boolean) => void; newAddress: { label: string; detail: string };
  setNewAddress: (value: { label: string; detail: string }) => void; phone: string; setPhone: (value: string) => void;
  phoneEditable: boolean; dates: string[]; slotDate: string; setSlotDate: (value: string) => void; slots: PickupSlot[];
  slotId: string; setSlotId: (value: string) => void; instructionsOpen: boolean; setInstructionsOpen: (value: boolean) => void;
  instructions: string; setInstructions: (value: string) => void; errors: Record<string, string>; language: string;
  supportPhone: string; storeName: string; storeHours: string; t: T;
};

function FulfillmentStep(p: FulfillmentProps) {
  const needsAddress = p.collectionMethod === 'home_pickup' || p.returnMethod === 'home_delivery';
  const daySlots = p.slots.filter((slot) => slot.date === p.slotDate);
  const [showAllDates, setShowAllDates] = useState(false);
  const visibleDates = showAllDates ? p.dates : p.dates.slice(0, 4);
  const duplicateAddressIds = useMemo(() => {
    const fingerprints = new Map<string, string>();
    const duplicates = new Set<string>();
    p.addresses.forEach((address) => {
      const fingerprint = address.detail.toLocaleLowerCase().replace(/[\s.,/#()\-]/g, '');
      const first = fingerprints.get(fingerprint);
      if (fingerprint && first) { duplicates.add(first); duplicates.add(address.id); }
      else if (fingerprint) fingerprints.set(fingerprint, address.id);
    });
    return duplicates;
  }, [p.addresses]);
  const addressLabel = p.collectionMethod === 'home_pickup' && p.returnMethod === 'home_delivery'
    ? 'Pickup and delivery address'
    : p.collectionMethod === 'home_pickup' ? 'Pickup address' : 'Delivery address';
  return <View>
    <CheckoutSectionTitle title={p.t('How should we receive it?')} helper={p.t('Choose pickup or drop-off, then how your clean laundry comes back.')} />
    <Text style={styles.label}>{p.t('How should we receive your laundry?')}</Text>
    <View style={styles.choiceGrid}>
      <PaymentSelector style={styles.fulfillmentChoice} leading={<View style={styles.choiceIcon}><SymbolView name={{ ios: 'house.fill', android: 'home_map_marker', web: 'home-map-marker' }} size={26} tintColor={C.tealPressed} /></View>} title={p.t('Home Pickup')} subtitle={p.t('We collect your laundry from your address.')} selected={p.collectionMethod === 'home_pickup'} onPress={() => p.setCollectionMethod('home_pickup')} />
      <PaymentSelector style={styles.fulfillmentChoice} leading={<View style={styles.choiceIcon}><SymbolView name={{ ios: 'storefront.fill', android: 'storefront', web: 'storefront-outline' }} size={26} tintColor={p.collectionMethod === 'store_dropoff' ? C.tealPressed : C.muted} /></View>} title={p.t('Store Drop-off')} subtitle={p.t('Bring your laundry to Super Shine.')} selected={p.collectionMethod === 'store_dropoff'} onPress={() => p.setCollectionMethod('store_dropoff')} />
    </View>
    <Text style={[styles.label, styles.gap]}>{p.t('How would you like your clean laundry returned?')}</Text>
    <View style={styles.choiceGrid}>
      <PaymentSelector style={styles.fulfillmentChoice} leading={<View style={styles.choiceIcon}><SymbolView name={{ ios: 'scooter', android: 'delivery_dining', web: 'truck-delivery-outline' }} size={26} tintColor={C.tealPressed} /></View>} title={p.t('Home Delivery')} subtitle={p.t('We deliver your clean laundry to your address.')} selected={p.returnMethod === 'home_delivery'} onPress={() => p.setReturnMethod('home_delivery')} />
      <PaymentSelector style={styles.fulfillmentChoice} leading={<View style={styles.choiceIcon}><SymbolView name={{ ios: 'bag.fill', android: 'shopping_bag', web: 'shopping-outline' }} size={26} tintColor={p.returnMethod === 'store_collection' ? C.tealPressed : C.muted} /></View>} title={p.t('Store Collection')} subtitle={p.t('Pick up your clean laundry at Super Shine.')} selected={p.returnMethod === 'store_collection'} onPress={() => p.setReturnMethod('store_collection')} />
    </View>
    {p.collectionMethod === 'store_dropoff' || p.returnMethod === 'store_collection' ? <CustomerCard style={[styles.form, styles.gap]}><Text style={styles.title}>{p.storeName}</Text><Text style={styles.muted}>{p.t('Opening hours')}: {p.storeHours}</Text>{p.supportPhone ? <Text style={styles.linkText}>{p.supportPhone}</Text> : null}</CustomerCard> : null}
    <CustomerCard style={[styles.form, styles.gap]}>
    {needsAddress ? <View>
      <View style={styles.detailHeading}><View style={styles.detailHeadingIcon}><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'map-marker-outline' }} size={21} tintColor={C.tealPressed} /></View><Text style={styles.label}>{p.t(addressLabel)}</Text></View>
      {duplicateAddressIds.size ? <InformationBanner title={p.t('Similar saved addresses found')} message={p.t('Choose carefully, then remove any duplicate in Profile after placing your order.')} icon={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} tone="attention" /> : null}
      <View style={styles.stack}>{p.addresses.map((address) => <AddressSelector key={address.id} title={`${address.label}${duplicateAddressIds.has(address.id) ? ` · ${p.t('Similar')}` : ''}`} subtitle={address.detail} selected={p.addressId === address.id} onPress={() => p.setAddressId(address.id)} />)}</View>
      <Pressable onPress={() => p.setNewAddressOpen(!p.newAddressOpen)} style={styles.link}><Text style={styles.linkText}>{p.t(p.newAddressOpen ? 'Cancel new address' : 'Add another address')}</Text></Pressable>
      {p.newAddressOpen ? <View style={styles.newAddressForm}><CheckoutField label={p.t('Address label')} value={p.newAddress.label} onChangeText={(label) => p.setNewAddress({ ...p.newAddress, label })} /><CheckoutField label={p.t('Full address')} value={p.newAddress.detail} onChangeText={(detail) => p.setNewAddress({ ...p.newAddress, detail })} multiline error={p.errors.address} /></View> : <InlineError message={p.errors.address} />}
    </View> : null}
    <View style={styles.detailSection}><CheckoutField label={p.t('Contact phone')} value={p.phone} onChangeText={p.setPhone} editable={p.phoneEditable} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={p.errors.phone} />{!p.phoneEditable ? <Text style={styles.muted}>{p.t('Orders use your account phone number.')}</Text> : null}</View>
    {p.collectionMethod === 'home_pickup' ? <View style={styles.detailSection}>
      <Text style={styles.label}>{p.t('Pickup time')}</Text>
      {p.dates.length ? <><View style={styles.dates}>{visibleDates.map((date) => <Pressable key={date} onPress={() => p.setSlotDate(date)} style={[styles.date, p.slotDate === date && styles.dateChosen]}><Text style={[styles.dateText, p.slotDate === date && styles.dateTextChosen]}>{formatDate(date, p.language)}</Text></Pressable>)}{p.dates.length > 4 ? <Pressable accessibilityRole="button" accessibilityLabel={p.t('Choose another date')} onPress={() => setShowAllDates((value) => !value)} style={styles.calendarDate}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar-month-outline' }} size={20} tintColor={C.navy} /></Pressable> : null}</View><View style={styles.slotGrid}>{daySlots.map((slot) => <PickupSlotSelector key={slot.id} title={`${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`} subtitle={slot.capacity - slot.bookedCount <= 3 ? p.t('{{count}} spaces left', { count: slot.capacity - slot.bookedCount }) : undefined} selected={p.slotId === slot.id} onPress={() => p.setSlotId(slot.id)} style={styles.slotChoice} />)}</View></> : <View style={styles.emptySlots}><Text style={styles.title}>{p.t('No pickup slots available')}</Text><Text style={styles.muted}>{p.t('Contact Super Shine and we will help arrange your pickup.')}</Text>{p.supportPhone ? <Text style={styles.linkText}>{p.supportPhone}</Text> : null}</View>}
      <InlineError message={p.errors.slot} />
      <Pressable onPress={() => p.setInstructionsOpen(!p.instructionsOpen)} style={styles.link}><Text style={styles.linkText}>{p.t(p.instructionsOpen ? 'Hide pickup instructions' : 'Add pickup instructions')}</Text></Pressable>
      {p.instructionsOpen ? <CheckoutField label={p.t('Pickup instructions')} optional={p.t('Optional')} value={p.instructions} onChangeText={p.setInstructions} multiline /> : null}
    </View> : null}
    </CustomerCard>
  </View>;
}

type PaymentProps = { payment: PaymentMethod; setPayment: (value: PaymentMethod) => void; returnMethod: ReturnMethod; coupons: Coupon[]; couponCode: string; setCouponCode: (value: string) => void; couponError: string; allCoupons: boolean; setAllCoupons: (value: boolean) => void; subtotal: number; pickupFee: number; deliveryFee: number; discount: number; pickupBenefitDiscount: number; total: number; selected: Record<string, number>; services: LaundryService[]; couponTarget: string; estimated: boolean; submitError?: string; t: T };
function PaymentStep(p: PaymentProps) {
  const eligibleCoupons = p.coupons.filter((coupon) => !isCouponOrderEligible(coupon, p.subtotal, p.selected, Date.now(), { pickupFee: Math.max(0, p.pickupFee - p.pickupBenefitDiscount), deliveryFee: p.deliveryFee }, p.services));
  const cashMethod: PaymentMethod = p.returnMethod === 'home_delivery' ? 'cash_delivery' : 'cash_pickup';
  return <View><Text style={styles.paymentHeading}>{p.t('Payment method')}</Text><View style={styles.stack}>{([cashMethod, 'promptpay'] as PaymentMethod[]).map((method) => <PaymentSelector key={method} title={method === 'cash_pickup' ? p.t('Cash on collection') : p.t(`paymentMethod.${method}`)} subtitle={method === 'promptpay' ? p.t('The exact amount and QR appear when payment is due.') : undefined} selected={p.payment === method} onPress={() => p.setPayment(method)} />)}</View><View style={styles.gap}><View style={styles.between}><Text style={styles.label}>{p.t('Coupons')}</Text>{eligibleCoupons.length > 1 ? <Pressable onPress={() => p.setAllCoupons(!p.allCoupons)}><Text style={styles.linkText}>{p.t(p.allCoupons ? 'Show best only' : 'View all coupons')}</Text></Pressable> : null}</View>{eligibleCoupons.length ? <View style={styles.stack}>{(p.allCoupons ? eligibleCoupons : eligibleCoupons.slice(0, 1)).map((coupon) => <CouponSelector key={coupon.code} title={`${coupon.code} · ${coupon.title}`} subtitle={`${p.t('Applies to {{target}}', { target: p.t(couponTargetLabel(coupon)).toLowerCase() })}${coupon.minimumOrder ? ` · ${p.t('Minimum order {{amount}}', { amount: formatBaht(coupon.minimumOrder) })}` : ''}`} selected={p.couponCode === coupon.code} onPress={() => p.setCouponCode(p.couponCode === coupon.code ? '' : coupon.code)} />)}</View> : <Text style={styles.muted}>{p.t('No eligible coupons are available for this profile.')}</Text>}{p.couponCode ? <Pressable onPress={() => p.setCouponCode('')} style={styles.link}><Text style={[styles.linkText, { color: C.error }]}>{p.t('Remove coupon')}</Text></Pressable> : null}<InlineError message={p.couponCode ? p.couponError : ''} /></View><View style={styles.gap}><Text style={styles.paymentHeading}>{p.t('Price summary')}</Text><Breakdown subtotal={p.subtotal} pickup={p.pickupFee} delivery={p.deliveryFee} discount={p.discount} pickupBenefitDiscount={p.pickupBenefitDiscount} couponTarget={p.couponTarget} total={p.total} t={p.t} /></View>{p.estimated ? <CustomerCard style={styles.notice}><SymbolView name={{ ios: 'info.circle.fill', android: 'info', web: 'info' }} size={20} tintColor="#93610F" /><Text style={styles.noticeText}>{p.t('This is an estimate. Super Shine will confirm the final price after inspecting your laundry, and you can approve any change before work continues.')}</Text></CustomerCard> : null}<Text style={styles.confirm}>{p.t('By placing this order, you confirm that the fulfillment and contact details are correct.')}</Text><InlineError message={p.submitError} /></View>;
}

type ReviewProps = { services: LaundryService[]; selected: Record<string, number>; preferences: Record<string, Record<string, unknown>>; collectionMethod: CollectionMethod; returnMethod: ReturnMethod; address: string; slot?: PickupSlot; language: string; phone: string; comment: string; setComment: (value: string) => void; edit: (step: number) => void; error?: string; t: T };
function ReviewStep(p: ReviewProps) {
  const collection = p.collectionMethod === 'home_pickup' ? p.t('Home Pickup') : p.t('Store Drop-off');
  const returning = p.returnMethod === 'home_delivery' ? p.t('Home Delivery') : p.t('Store Collection');
  const preferenceSummary = Object.values(p.preferences)
    .flatMap((value) => Object.values(value))
    .filter((value): value is string => typeof value === 'string' && Boolean(value) && !isLocalPhotoUri(value))
    .map((value) => p.t(`option.${value === 'customer_own' ? 'customer_supplied' : value}`))
    .join(' · ') || p.t('option.standard');
  return <View><CheckoutSectionTitle title={p.t('Everything look right?')} helper={p.t('Review the details, choose payment, and place your order.')} /><View style={styles.stack}>
    <ExpandableDetailSection title={p.t('Services')} summary={p.t(p.services.length === 1 ? '1 service selected' : '{{count}} services selected', { count: p.services.length })} defaultOpen onEdit={() => p.edit(1)}>{p.services.map((service) => <Text key={service.id} style={styles.review}>{p.t(service.nameKey)} × {p.selected[service.id]}</Text>)}</ExpandableDetailSection>
    <ExpandableDetailSection title={p.t('Preferences')} summary={preferenceSummary} onEdit={() => p.edit(2)}><Text style={styles.review}>{preferenceSummary}</Text></ExpandableDetailSection>
    <ExpandableDetailSection title={p.t('Fulfillment')} summary={`${collection} · ${returning}`} onEdit={() => p.edit(3)}><Text style={styles.review}>{p.t('Receive laundry')}: {collection}</Text><Text style={styles.review}>{p.t('Return laundry')}: {returning}</Text>{p.address ? <Text style={styles.review}>{p.address}</Text> : null}{p.slot && p.collectionMethod === 'home_pickup' ? <Text style={styles.review}>{pickupSlotLabel(p.slot, p.language)}</Text> : null}<Text style={styles.review}>{p.phone}</Text></ExpandableDetailSection>
    <CheckoutField label={p.t('Customer order note')} optional={p.t('Optional')} value={p.comment} onChangeText={p.setComment} multiline />
    <InlineError message={p.comment.trim().length > ORDER_NOTE_MAX_LENGTH ? p.t('Keep the customer order note under 1000 characters.') : undefined} />
    <InlineError message={p.error} />
  </View></View>;
}
function Breakdown({ subtotal, pickup, delivery, discount, pickupBenefitDiscount, couponTarget, total, t }: { subtotal: number; pickup: number; delivery: number; discount: number; pickupBenefitDiscount: number; couponTarget?: string; total: number; t: T }) { const couponDiscountValue = Math.max(0, discount - pickupBenefitDiscount); return <PriceBreakdown rows={[{ label: t('Subtotal'), value: formatBaht(subtotal) }, { label: t('Pickup fee'), value: formatBaht(pickup) }, { label: t('Delivery fee'), value: formatBaht(delivery) }, ...(pickupBenefitDiscount > 0 ? [{ label: t('Free pickup benefit'), value: `−${formatBaht(pickupBenefitDiscount)}`, tone: 'discount' as const }] : []), ...(couponDiscountValue > 0 ? [{ label: t('Coupon discount · {{target}}', { target: t(couponTarget || 'Service subtotal') }), value: `−${formatBaht(couponDiscountValue)}`, tone: 'discount' as const }] : [])]} totalLabel={t('Estimated total')} total={formatBaht(total)} />; }
function formatDate(date: string, language: string) { return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00+07:00`)); }
function isLocalPhotoUri(value: string) { return /^(file|content|blob):/.test(value); }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.canvas },
  flex: { flex: 1 },
  header: { width: '100%', maxWidth: CustomerLayout.checkoutMaxWidth, alignSelf: 'center', paddingHorizontal: CustomerLayout.pagePadding },
  content: { width: '100%', maxWidth: CustomerLayout.checkoutMaxWidth, alignSelf: 'center', paddingHorizontal: CustomerLayout.pagePadding, paddingBottom: S.section },
  stepEyebrow: { color: C.tealPressed, fontFamily: FontFamilyMedium, fontSize: 10, lineHeight: 14, fontWeight: '500', letterSpacing: 1.6, marginBottom: 7 },
  stack: { gap: S.md },
  serviceList: { padding: 0, overflow: 'hidden' },
  service: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: S.md, padding: 14 },
  serviceDivider: { height: 1, backgroundColor: C.border, marginLeft: 64 },
  chosen: { borderColor: C.teal, backgroundColor: C.mint },
  serviceIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  preferenceHeader: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingBottom: S.lg, borderBottomWidth: 1, borderBottomColor: C.border },
  preferenceOption: { minHeight: 76, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S.lg, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.border },
  preferenceIntro: { flex: 1, minWidth: 230, flexDirection: 'row', alignItems: 'center', gap: S.md },
  preferenceIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  preferenceCopy: { flex: 1 },
  preferenceLabel: { ...CustomerType.label, color: C.navy },
  preferenceHelper: { ...CustomerType.caption, color: C.muted, marginTop: 2 },
  preferenceControl: { flex: 1.35, minWidth: 280 },
  preferenceSwitch: { minWidth: 154, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: S.md },
  switchState: { ...CustomerType.caption, color: C.muted },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  fulfillmentChoice: { flexGrow: 1, flexBasis: 330, minHeight: 100, padding: S.lg },
  choiceIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  detailHeadingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  detailSection: { paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.border },
  newAddressForm: { gap: S.md, paddingTop: S.sm },
  emptySlots: { borderRadius: CustomerRadius.control, backgroundColor: C.disabledSoft, padding: S.lg },
  copy: { flex: 1, minWidth: 110 },
  title: { ...CustomerType.label, color: C.navy },
  muted: { ...CustomerType.caption, color: C.muted, marginTop: 2 },
  meta: { fontSize: 11, lineHeight: 16, color: C.tealPressed, fontWeight: '700', marginTop: 4 },
  form: { gap: S.lg },
  section: { ...CustomerType.section, color: C.navy },
  label: { ...CustomerType.label, color: C.navy, marginBottom: S.sm },
  link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  linkText: { color: C.tealPressed, fontSize: 13, fontWeight: '700' },
  gap: { marginTop: S.section },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, paddingBottom: S.md },
  date: { minHeight: 50, minWidth: 108, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md, borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  calendarDate: { width: 50, height: 50, borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  dateChosen: { backgroundColor: C.mint, borderColor: C.teal },
  dateText: { color: C.text, fontSize: 12, fontWeight: '600' },
  dateTextChosen: { color: C.tealPressed, fontWeight: '700' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  slotChoice: { flexGrow: 1, flexBasis: 180 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentHeading: { ...CustomerType.section, color: C.navy, fontFamily: FontFamilyMedium, marginBottom: S.md },
  photoPicker: { minHeight: 58, borderWidth: 1, borderStyle: 'dashed', borderColor: C.teal, borderRadius: CustomerRadius.control, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: S.sm },
  photoRow: { flexDirection: 'row', gap: S.md },
  photo: { width: 82, height: 82, borderRadius: CustomerRadius.control },
  review: { ...CustomerType.body, color: C.text, marginBottom: S.xs },
  notice: { flexDirection: 'row', gap: S.md, backgroundColor: C.attentionSoft, borderColor: C.attention },
  noticeText: { ...CustomerType.body, color: '#714B0D', flex: 1 },
  confirm: { ...CustomerType.body, color: C.navy, fontWeight: '700', marginTop: S.section },
  combinedPayment: { marginTop: S.xxl, paddingTop: S.xxl, borderTopWidth: 1, borderTopColor: C.border },
});
