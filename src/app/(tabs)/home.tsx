import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Page, SectionHeader } from '@/components/super-ui';
import { SkeletonBlock } from '@/components/customer-ui';
import { SymbolView, type SymbolViewProps } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht, formatBangkokDate } from '@/lib/domain';
import { servicePalette, serviceSymbol } from '@/lib/icons';
import { CUSTOMER_STATUS_LABELS } from '@/lib/order-workflow';
import type { CustomerOrder, LaundryService } from '@/types/domain';

export default function HomeScreen() {
  const { activeOrder, businessSettings, coupons, dataError, dataLoading, language, orders, profile, refresh, services, t, unreadNotifications } = useApp();
  const availableServices = services.filter((service) => service.enabled);
  const lastOrder = orders.find((order) => ['delivered', 'collected'].includes(order.status));
  const featuredCoupon = coupons.find((coupon) => coupon.active);
  const serviceCounts = orders.flatMap((order) => order.items).reduce<Record<string, number>>((counts, item) => {
    counts[item.serviceId] = (counts[item.serviceId] || 0) + item.quantity;
    return counts;
  }, {});
  const popularServiceId = Object.entries(serviceCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? availableServices[0]?.id;

  if (dataLoading && !services.length) {
    return <Page><View style={styles.loadingHeader}><SkeletonBlock width="40%" height={13} /><SkeletonBlock width="58%" height={32} /></View><SkeletonBlock height={194} style={styles.loadingCard} /><SkeletonBlock height={55} style={styles.loadingCard} /><View style={styles.loadingGrid}><SkeletonBlock height={130} style={styles.loadingService} /><SkeletonBlock height={130} style={styles.loadingService} /></View></Page>;
  }

  if (dataError && !services.length) {
    return <Page contentStyle={styles.center}><Text style={styles.errorTitle}>{t('We could not load the app')}</Text><Text style={styles.muted}>{t(dataError)}</Text><Button label={t('Retry')} onPress={() => void refresh()} style={styles.retry} /></Page>;
  }

  return (
    <Page>
      <View style={styles.header}>
        <View pointerEvents="none" style={styles.greetingGlow} />
        <View pointerEvents="none" style={styles.greetingGlowSmall} />
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t('GOOD MORNING')}</Text>
          <Text style={styles.name}>{profile.name.split(' ')[0] || t('Customer')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Notifications')} onPress={() => router.push('/notifications')} style={styles.notificationButton}>
          <SymbolView name={{ ios: 'bell', android: 'bell-outline', web: 'bell-outline' }} size={19} tintColor={Colors.navy} />
          {unreadNotifications.length ? <View style={styles.notificationDot} /> : null}
        </Pressable>
      </View>

      {activeOrder ? <ActiveOrder order={activeOrder} language={language} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !availableServices.length }}
        disabled={!availableServices.length}
        onPress={() => router.push('/new-order')}
        style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, !availableServices.length && styles.disabled]}>
        <Text style={styles.primaryActionText}>{t(activeOrder ? 'Start another order' : 'Start an order')}</Text>
        <View style={styles.actionCircle}><SymbolView name={{ ios: 'arrow.right', android: 'arrow-right', web: 'arrow-right' }} size={18} tintColor={Colors.surface} /></View>
      </Pressable>

      <View style={styles.quickGrid}>
        <QuickAction
          icon={{ ios: 'arrow.counterclockwise', android: 'rotate-left', web: 'rotate-left' }}
          title={t('Repeat last order')}
          subtitle={lastOrder?.itemSummary || t('Your previous order')}
          disabled={!lastOrder}
          onPress={() => lastOrder && router.push({ pathname: '/new-order', params: { repeatOrderId: lastOrder.databaseId } })}
        />
        <QuickAction
          icon={{ ios: 'mappin', android: 'map-marker-outline', web: 'map-marker-outline' }}
          title={t('Store drop-off')}
          subtitle={businessSettings.storeName}
          onPress={() => router.push({ pathname: '/new-order', params: { fulfillment: 'store_dropoff' } })}
        />
      </View>

      {featuredCoupon ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/new-order', params: { coupon: featuredCoupon.code } })} style={({ pressed }) => [styles.offerBanner, pressed && styles.pressed]}>
        <View style={styles.offerBadge}><Text style={styles.offerBadgeText}>{t('OFFER')}</Text></View>
        <View style={styles.offerCopy}><Text numberOfLines={1} style={styles.offerTitle}>{t(featuredCoupon.title)}</Text><Text numberOfLines={1} style={styles.offerDetail}>{t('Use code {{code}}', { code: featuredCoupon.code })}</Text></View>
        <SymbolView name={{ ios: 'arrow.right', android: 'arrow-right', web: 'arrow-right' }} size={17} tintColor={Colors.surface} />
      </Pressable> : null}

      <View style={styles.section}>
        <SectionHeader title={t('Services')} action={t('View all')} onAction={() => router.push('/services')} />
        {!availableServices.length && services.length ? <Card style={styles.unavailableNotice}><Text style={styles.errorTitle}>{t('All services are temporarily unavailable.')}</Text><Text style={styles.muted}>{t('Please check back later or contact Super Shine.')}</Text></Card> : null}
        {services.length ? <View style={styles.serviceGrid}>{services.map((service) => <ServiceCard key={service.id} service={service} popular={service.id === popularServiceId} />)}</View> : null}
      </View>
    </Page>
  );
}

function ActiveOrder({ order, language }: { order: CustomerOrder; language: string }) {
  const { t } = useApp();
  const stage = journeyStage(order);
  const title = order.status === 'processing' ? 'In expert care' : CUSTOMER_STATUS_LABELS[order.status];
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/order-tracking', params: { orderId: order.databaseId } })} style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}>
      <View style={styles.activeBubble} />
      <Text style={styles.activeEyebrow}>{t('ORDER')} {order.id} · {t('IN PROGRESS')}</Text>
      <Text style={styles.activeTitle}>{t(title)}</Text>
      <Text style={styles.activeEta}>{order.deliveryEta ? t('Expected back {{time}}', { time: formatBangkokDate(order.deliveryEta, language) }) : t('Expected return time coming soon')}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0.08, order.progress) * 100}%` }]} /></View>
      <View style={styles.activeBottom}>
        <Text style={styles.activeStage}>{t(stage.label)} · {t('Step {{current}} of 5', { current: stage.number })}</Text>
        <View style={styles.trackLink}><Text style={styles.trackLinkText}>{t('Track order')}</Text><SymbolView name={{ ios: 'chevron.right', android: 'chevron-right', web: 'chevron-right' }} size={15} tintColor={Colors.surface} /></View>
      </View>
    </Pressable>
  );
}

function journeyStage(order: CustomerOrder) {
  if (['pending', 'accepted'].includes(order.status)) return { number: 1, label: 'Confirmed' };
  if (['pickup_in_progress', 'picked_up', 'awaiting_dropoff', 'received_at_store'].includes(order.status)) return { number: 2, label: order.collectionMethod === 'home_pickup' ? 'Pickup' : 'Drop-off' };
  if (order.status === 'processing') return { number: 3, label: 'Cleaning' };
  if (['ready', 'ready_for_collection', 'out_for_delivery'].includes(order.status)) return { number: 4, label: order.returnMethod === 'home_delivery' ? 'Returning' : 'Ready' };
  return { number: 5, label: 'Complete' };
}

function ServiceCard({ service, popular }: { service: LaundryService; popular?: boolean }) {
  const { t } = useApp();
  const palette = servicePalette(service.icon);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !service.enabled }} disabled={!service.enabled} onPress={() => router.push({ pathname: '/new-order', params: { service: service.id } })} style={({ pressed }) => [styles.serviceCard, { borderTopColor: palette.color }, !service.enabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.serviceTop}><View style={[styles.serviceIcon, { backgroundColor: palette.background }]}><SymbolView name={serviceSymbol(service.icon)} size={19} tintColor={palette.color} /></View>{popular ? <View style={styles.popularBadge}><Text style={styles.popularText}>{t('POPULAR')}</Text></View> : null}</View>
      <View>
        <Text numberOfLines={2} style={styles.serviceName}>{t(service.nameKey)}</Text>
        <Text style={styles.servicePrice}>{t('From {{price}} / {{unit}}', { price: formatBaht(service.price), unit: t(service.priceUnit) })} · {t('{{hours}}h', { hours: service.turnaroundHours })}</Text>
        {!service.enabled ? <Text style={styles.unavailableText}>{t('Temporarily unavailable')}</Text> : null}
      </View>
    </Pressable>
  );
}

function QuickAction({ icon, title, subtitle, disabled, onPress }: { icon: SymbolViewProps['name']; title: string; subtitle: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.quickAction, disabled && styles.disabled, pressed && styles.pressed]}><View style={styles.quickIcon}><SymbolView name={icon} size={18} tintColor={Colors.tealDark} /></View><View style={styles.quickCopy}><Text numberOfLines={1} style={styles.quickText}>{title}</Text><Text numberOfLines={1} style={styles.quickSubtitle}>{subtitle}</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 500, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  muted: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 18, fontWeight: '500' },
  retry: { marginTop: Space.md, minWidth: 160 },
  loadingHeader: { gap: Space.sm, paddingTop: 18, paddingBottom: 18 }, loadingCard: { marginBottom: Space.md, borderRadius: Radius.large }, loadingGrid: { flexDirection: 'row', gap: 10 }, loadingService: { flex: 1, borderRadius: 19 },
  header: { paddingTop: 13, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -54, top: -95, backgroundColor: 'rgba(11,145,133,.07)' },
  greetingGlowSmall: { position: 'absolute', width: 90, height: 90, borderRadius: 45, left: 82, top: -47, backgroundColor: 'rgba(11,145,133,.045)' },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.teal, fontFamily: FontFamilyMedium, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 2.1 },
  name: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 25, lineHeight: 31, fontWeight: '500', letterSpacing: -0.45, marginTop: 5 },
  notificationButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.coral, top: 6, right: 6, borderWidth: 1, borderColor: Colors.surface },
  activeCard: { backgroundColor: Colors.tealDark, borderRadius: Radius.xlarge, padding: 20, overflow: 'hidden', ...Shadow },
  activeBubble: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,.08)', right: -42, top: -75 },
  activeEyebrow: { color: '#C7EEEA', fontFamily: FontFamilyMedium, fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 1.5 },
  activeTitle: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 19, lineHeight: 24, fontWeight: '500', marginTop: 11 },
  activeEta: { color: '#D7EFEC', fontFamily: FontFamily, fontSize: 13, lineHeight: 18, marginTop: 5 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.28)', marginTop: 20 },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: Colors.surface },
  activeBottom: { minHeight: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: Space.md, marginTop: 9 },
  activeStage: { color: Colors.surface, fontFamily: FontFamily, fontSize: 12, flex: 1 },
  trackLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trackLinkText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  primaryAction: { minHeight: 55, marginTop: 12, borderRadius: 18, backgroundColor: Colors.navy, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryActionText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' },
  actionCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#35C8BC', alignItems: 'center', justifyContent: 'center' },
  quickGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  quickAction: { flex: 1, minHeight: 76, borderRadius: 16, backgroundColor: Colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, ...Shadow },
  quickIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  quickCopy: { flex: 1, minWidth: 0 },
  quickText: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  quickSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9, lineHeight: 13, marginTop: 3 },
  offerBanner: { minHeight: 66, marginTop: 12, borderRadius: 17, backgroundColor: Colors.teal, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, ...Shadow },
  offerBadge: { minHeight: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)', paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  offerBadgeText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500', letterSpacing: 1 },
  offerCopy: { flex: 1, minWidth: 0 },
  offerTitle: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  offerDetail: { color: '#D9F3EF', fontFamily: FontFamily, fontSize: 10, marginTop: 2 },
  section: { marginTop: 23 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: { flexGrow: 1, flexBasis: '46%', minWidth: 135, minHeight: 130, borderRadius: 19, borderTopWidth: 3, backgroundColor: Colors.surface, padding: 14, justifyContent: 'space-between', ...Shadow },
  serviceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  serviceIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  popularBadge: { borderRadius: 10, backgroundColor: Colors.coralLight, paddingHorizontal: 7, paddingVertical: 4 },
  popularText: { color: Colors.coral, fontFamily: FontFamilyMedium, fontSize: 8, fontWeight: '500', letterSpacing: .6 },
  serviceName: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 16, lineHeight: 20, fontWeight: '500' },
  servicePrice: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11, lineHeight: 16, marginTop: 5 },
  unavailableText: { color: Colors.coral, fontFamily: FontFamily, fontSize: 10, marginTop: 5 },
  unavailableNotice: { padding: 18, marginBottom: 10, gap: 5 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.46 },
});
