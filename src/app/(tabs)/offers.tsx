import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Page, ScreenTitle, SectionHeader } from '@/components/super-ui';
import { SkeletonBlock } from '@/components/customer-ui';
import { SymbolView } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht } from '@/lib/domain';
import { couponTargetLabel } from '@/lib/customer-rules';
import { CHECKOUT_DRAFT_KEY, type CheckoutDraft } from '@/hooks/use-checkout-draft';
import type { Coupon } from '@/types/domain';

export default function OffersScreen() {
  const { couponError, couponLoading, coupons, customerEligibility, language, refreshCoupons, services, t } = useApp();
  const [draftSubtotal, setDraftSubtotal] = useState(0);
  const featured = coupons.find((coupon) => coupon.active) ?? coupons[0];
  useEffect(() => {
    AsyncStorage.getItem(CHECKOUT_DRAFT_KEY).then((raw) => {
      if (!raw) return setDraftSubtotal(0);
      try {
        const draft = JSON.parse(raw) as CheckoutDraft;
        setDraftSubtotal(services.reduce((sum, service) => sum + service.price * Math.max(0, draft.selected?.[service.id] || 0), 0));
      } catch { setDraftSubtotal(0); }
    });
  }, [services]);
  return (
    <Page>
      <ScreenTitle eyebrow={t('SAVE MORE')} title={t('Offers')} subtitle={t('Only offers available for your account appear here.')} />
      {featured ? <FeaturedOffer coupon={featured} /> : null}
      <View style={styles.availableHeader}><SectionHeader title={t('Available offers')} action={String(coupons.length)} /></View>
      {couponLoading && !coupons.length ? <View style={styles.loading}><SkeletonBlock height={142} style={styles.loadingCard} /><SkeletonBlock height={112} style={styles.loadingCard} /></View> : null}
      {couponError ? <Card style={styles.state}><Text style={styles.stateTitle}>{t('We could not load available offers.')}</Text><Button label={t('Retry')} onPress={() => void refreshCoupons(true)} /></Card> : null}
      {!couponLoading && !couponError && !coupons.length ? <Card style={styles.state}><Text style={styles.stateTitle}>{t('No active offers')}</Text><Text style={styles.detail}>{t('Check back later for new laundry offers.')}</Text></Card> : null}
      {!couponError ? <View style={styles.list}>{coupons.map((coupon, index) => <CouponCard key={coupon.code} coupon={coupon} language={language} phoneVerified={customerEligibility.phoneVerified} eligibleCode={customerEligibility.eligibleCouponCodes.includes(coupon.code)} serviceNames={coupon.eligibleServiceIds.map((id) => services.find((service) => service.id === id)).filter(Boolean).map((service) => t(service!.nameKey))} blue={coupon.discountType === 'free' || index % 2 === 1} draftSubtotal={draftSubtotal} />)}</View> : null}
    </Page>
  );
}

function FeaturedOffer({ coupon }: { coupon: Coupon }) {
  const { t } = useApp();
  const value = couponValue(coupon, t);
  const urgencyDays = couponUrgencyDays(coupon.expiresAt);
  return (
    <View style={styles.hero}>
      <View style={styles.heroBubble} />
      <View style={styles.heroTop}><Text style={styles.heroEyebrow}>{t('RECOMMENDED FOR YOU')}</Text>{urgencyDays ? <View style={styles.urgencyBadge}><Text style={styles.urgencyText}>{t(urgencyDays === 1 ? '1 DAY LEFT' : '{{count}} DAYS LEFT', { count: urgencyDays })}</Text></View> : null}</View>
      <Text style={styles.heroTitle}>{t('{{value}} your next laundry order', { value })}</Text>
      <Text style={styles.heroDetail}>{coupon.minimumOrder ? t('Use {{code}} on an eligible service subtotal of {{amount}} or more.', { code: coupon.code, amount: formatBaht(coupon.minimumOrder) }) : t('Use {{code}} on your next eligible order.', { code: coupon.code })}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/new-order', params: { coupon: coupon.code } })} style={({ pressed }) => [styles.heroAction, pressed && styles.pressed]}><Text style={styles.heroActionText}>{t('Use this offer')}</Text><View style={styles.heroActionCircle}><SymbolView name={{ ios: 'arrow.right', android: 'arrow-right', web: 'arrow-right' }} size={17} tintColor={Colors.navy} /></View></Pressable>
    </View>
  );
}

function CouponCard({ coupon, language, phoneVerified, eligibleCode, serviceNames, blue, draftSubtotal }: { coupon: Coupon; language: string; phoneVerified: boolean; eligibleCode: boolean; serviceNames: string[]; blue: boolean; draftSubtotal: number }) {
  const { t } = useApp();
  const expired = Boolean(coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now());
  const exhausted = coupon.totalUsageLimit != null && coupon.usageCount >= coupon.totalUsageLimit;
  const identityReady = (!coupon.requiresVerifiedPhone || phoneVerified) && (!coupon.firstVerifiedProfileOnly || eligibleCode);
  const eligible = coupon.active && !expired && !exhausted && identityReady;
  const background = blue ? Colors.blueLight : Colors.yellowLight;
  const accent = blue ? Colors.blue : '#B67A12';
  const remaining = Math.max(0, (coupon.minimumOrder || 0) - draftSubtotal);
  const unlockProgress = coupon.minimumOrder ? `${Math.min(100, (draftSubtotal / coupon.minimumOrder) * 100)}%` as const : '0%' as const;
  const progressAmount = Math.min(draftSubtotal, coupon.minimumOrder || 0);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !eligible }} disabled={!eligible} onPress={() => router.push({ pathname: '/new-order', params: { coupon: coupon.code } })} style={({ pressed }) => [styles.coupon, !eligible && styles.ineligible, pressed && styles.pressed]}>
      <View style={[styles.couponIcon, { backgroundColor: background }]}><SymbolView name={blue ? { ios: 'truck.box', android: 'truck-delivery-outline', web: 'truck-delivery-outline' } : { ios: 'ticket', android: 'ticket-percent-outline', web: 'ticket-percent-outline' }} size={19} tintColor={accent} /></View>
      <View style={styles.couponCopy}>
        <Text style={styles.code}>{coupon.code}</Text>
        <Text style={styles.title}>{couponValue(coupon, t)}</Text>
        <Text style={styles.detail}>{serviceNames.length ? t('Eligible services: {{services}}', { services: serviceNames.join(', ') }) : t('Applies to {{target}}', { target: t(couponTargetLabel(coupon)).toLowerCase() })}{coupon.expiresAt ? ` · ${t('Expires {{date}}', { date: shortDate(coupon.expiresAt, language) })}` : ''}</Text>
        {coupon.minimumOrder ? <><View style={styles.progress}><View style={[styles.progressFill, { width: unlockProgress }]} /></View><Text style={styles.unlock}>{t('{{current}} of {{target}}', { current: formatBaht(progressAmount), target: formatBaht(coupon.minimumOrder) })} · {remaining > 0 ? t('{{amount}} more to unlock', { amount: formatBaht(remaining) }) : t('Ready to use')}</Text></> : null}
        {!eligible ? <Text style={styles.reason}>{t(expired ? 'This coupon has expired.' : exhausted ? 'This coupon has reached its usage limit.' : 'Verify your phone to use this offer.')}</Text> : null}
      </View>
      <Text style={[styles.use, { color: eligible ? Colors.tealDark : Colors.textMuted }]}>{t(eligible ? 'Use' : 'Unavailable')}</Text>
    </Pressable>
  );
}

function couponValue(coupon: Coupon, t: (key: string, values?: Record<string, string | number>) => string) {
  if (coupon.discountType === 'percentage') return t('{{value}}% off', { value: coupon.discountValue });
  if (coupon.discountType === 'free') return t('Free {{target}}', { target: t(couponTargetLabel(coupon)).toLowerCase() });
  return t('{{value}} off', { value: formatBaht(coupon.discountValue) });
}

function shortDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }).format(new Date(value));
}

function couponUrgencyDays(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  return Math.max(0, days);
}

const styles = StyleSheet.create({
  hero: { minHeight: 238, borderRadius: Radius.xlarge, backgroundColor: Colors.navy, padding: 20, overflow: 'hidden', ...Shadow },
  heroBubble: { position: 'absolute', width: 150, height: 150, borderRadius: 75, right: -43, top: -67, backgroundColor: 'rgba(11,145,133,.19)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroEyebrow: { color: '#A7E7E1', fontFamily: FontFamilyMedium, fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 1.7 },
  urgencyBadge: { minHeight: 25, borderRadius: 13, backgroundColor: 'rgba(238,116,109,.22)', paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  urgencyText: { color: '#FFD9D6', fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500', letterSpacing: .7 },
  heroTitle: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 21, lineHeight: 27, fontWeight: '500', marginTop: 15, maxWidth: 330 },
  heroDetail: { color: '#D3DEE1', fontFamily: FontFamily, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 380 },
  heroAction: { minHeight: 55, borderRadius: 18, backgroundColor: Colors.surface, marginTop: 18, paddingLeft: 17, paddingRight: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroActionText: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  heroActionCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#35C8BC', alignItems: 'center', justifyContent: 'center' },
  availableHeader: { marginTop: 25 },
  loading: { gap: 12 }, loadingCard: { borderRadius: Radius.large },
  list: { gap: 12 },
  coupon: { minHeight: 112, borderRadius: Radius.large, backgroundColor: Colors.surface, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow },
  couponIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  couponCopy: { flex: 1, minWidth: 0 },
  code: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500', letterSpacing: 1.4 },
  title: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 16, lineHeight: 21, fontWeight: '500', marginTop: 4 },
  detail: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10, lineHeight: 15, marginTop: 3 },
  progress: { height: 5, borderRadius: 3, backgroundColor: '#E7ECEB', marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: Colors.teal },
  unlock: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10, marginTop: 4 },
  use: { fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  reason: { color: Colors.coral, fontFamily: FontFamily, fontSize: 10, marginTop: 4 },
  ineligible: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  state: { padding: 18, gap: Space.md },
  stateTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 18, fontWeight: '500' },
});
