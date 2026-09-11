import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Page, ScreenTitle, SectionHeader } from '@/components/super-ui';
import { EmptyState, SkeletonBlock, StatusBadge } from '@/components/customer-ui';
import { SymbolView } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { ACTIVE_ORDER_STATUSES, formatBaht, formatBangkokDate } from '@/lib/domain';
import { customerAlert } from '@/lib/customer-alert';
import { CUSTOMER_STATUS_LABELS, customerStatusDetail } from '@/lib/order-workflow';
import type { CustomerOrder } from '@/types/domain';

type OrderTab = 'current' | 'past';

export default function OrdersScreen() {
  const { dataError, dataLoading, language, orders, refresh, t, withdrawOrder } = useApp();
  const [tab, setTab] = useState<OrderTab>('current');
  const [query, setQuery] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const currentOrders = useMemo(() => orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status)), [orders]);
  const pastOrders = useMemo(() => orders.filter((order) => !ACTIVE_ORDER_STATUSES.includes(order.status)), [orders]);
  const filteredPast = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? pastOrders.filter((order) => `${order.id} ${order.itemSummary}`.toLowerCase().includes(needle)) : pastOrders;
  }, [pastOrders, query]);

  async function confirmWithdrawal(order: CustomerOrder) {
    customerAlert(t('Withdraw this order?'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Withdraw order'), style: 'destructive', onPress: async () => {
        setBusyOrderId(order.databaseId);
        try { await withdrawOrder(order.databaseId); }
        catch (error) { customerAlert(t('Unable to withdraw order'), t(error instanceof Error ? error.message : 'UNKNOWN_ERROR')); }
        finally { setBusyOrderId(null); }
      } },
    ]);
  }

  if (dataLoading && !orders.length) return <Page><ScreenTitle eyebrow={t('YOUR LAUNDRY')} title={t('Orders')} /><SkeletonBlock height={44} style={styles.loading} /><SkeletonBlock height={330} style={styles.loading} /></Page>;

  return (
    <Page>
      <ScreenTitle eyebrow={t('YOUR LAUNDRY')} title={t('Orders')} />
      <View accessibilityRole="tablist" style={styles.segmented}>
        <TabButton selected={tab === 'current'} label={`${t('Current')} · ${currentOrders.length}`} onPress={() => setTab('current')} />
        <TabButton selected={tab === 'past'} label={t('Past orders')} onPress={() => setTab('past')} />
      </View>

      {dataError ? <Card style={styles.stateCard}><Text style={styles.stateTitle}>{t('Orders could not be loaded')}</Text><Text style={styles.stateText}>{t(dataError)}</Text><Button label={t('Retry')} onPress={() => void refresh()} /></Card> : null}

      {!dataError && tab === 'current' ? <>
        {currentOrders.length ? <>
          <ActiveOrderCard order={currentOrders[0]} busy={busyOrderId === currentOrders[0].databaseId} onWithdraw={() => void confirmWithdrawal(currentOrders[0])} />
          {currentOrders.slice(1).map((order) => <CompactOrderRow key={order.databaseId} order={order} language={language} />)}
        </> : <EmptyState icon={{ ios: 'bag', android: 'shopping-outline', web: 'shopping-outline' }} title={t('No active orders')} message={t('Your next laundry journey will appear here.')} action={<Button label={t('Start an order')} onPress={() => router.push('/new-order')} style={styles.emptyAction} />} />}

        {pastOrders.length ? <View style={styles.recent}>
          <SectionHeader title={t('Recent activity')} action={t('See history')} onAction={() => setTab('past')} />
          <Card style={styles.activityCard}>{pastOrders.slice(0, 2).map((order, index) => <View key={order.databaseId}><CompactOrderRow order={order} language={language} embedded />{index < Math.min(pastOrders.length, 2) - 1 ? <View style={styles.divider} /> : null}</View>)}</Card>
        </View> : null}
      </> : null}

      {!dataError && tab === 'past' ? <>
        <View style={styles.searchBox}><SymbolView name={{ ios: 'magnifyingglass', android: 'magnify', web: 'magnify' }} size={18} tintColor={Colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder={t('Search orders')} placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View>
        <View style={styles.pastList}>{filteredPast.map((order) => <PastOrderCard key={order.databaseId} order={order} language={language} />)}</View>
        {!filteredPast.length ? <Card style={styles.emptyCard}><Text style={styles.stateTitle}>{t('No past orders')}</Text><Text style={styles.stateText}>{t(query ? 'Try another order number or service name.' : 'Completed orders will appear here.')}</Text></Card> : null}
      </> : null}
    </Page>
  );
}

function TabButton({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.segmentButton, selected && styles.segmentButtonSelected]}><Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text></Pressable>;
}

function ActiveOrderCard({ order, busy, onWithdraw }: { order: CustomerOrder; busy: boolean; onWithdraw: () => void }) {
  const { language, t } = useApp();
  const canWithdraw = ['pending', 'accepted'].includes(order.status);
  return (
    <Card style={styles.activeCard}>
      <View style={styles.currentOrderFlag}><View style={styles.currentOrderDot} /><Text style={styles.currentOrderText}>{t('CURRENT ORDER')}</Text></View>
      <View style={styles.orderTop}><View><Text style={styles.orderNumber}>{order.id}</Text><Text numberOfLines={1} style={styles.orderService}>{order.itemSummary}</Text></View><View style={styles.statusPill}><Text style={styles.statusPillText}>{t(CUSTOMER_STATUS_LABELS[order.status])}</Text></View></View>
      <View style={styles.statusPanel}><Text style={styles.statusLabel}>{t('Expected return')}</Text><Text style={styles.statusValue}>{order.deliveryEta ? formatBangkokDate(order.deliveryEta, language) : t('Timing updates soon')}</Text><Text style={styles.statusNext}>{t('Next: {{detail}}', { detail: t(customerStatusDetail(order.status)) })}</Text></View>
      <View style={styles.factRow}><Fact label={t(order.finalTotal == null && order.pricingType === 'estimated' ? 'Estimated price' : 'Price')} value={`${formatBaht(order.amount)}${order.finalTotal == null && order.pricingType === 'estimated' ? ` ${t('estimated')}` : ''}`} /><Fact label={t('Payment')} value={t(`paymentStatus.${order.paymentStatus}`)} /></View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/order-tracking', params: { orderId: order.databaseId } })} style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}><Text style={styles.trackButtonText}>{t('Track order')}</Text><View style={styles.trackCircle}><SymbolView name={{ ios: 'arrow.right', android: 'arrow-right', web: 'arrow-right' }} size={17} tintColor={Colors.surface} /></View></Pressable>
      {canWithdraw ? <Pressable disabled={busy} onPress={onWithdraw} style={styles.withdraw}><Text style={styles.withdrawText}>{busy ? t('Withdrawing…') : t('Withdraw order')}</Text></Pressable> : null}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>; }

function CompactOrderRow({ order, language, embedded = false }: { order: CustomerOrder; language: string; embedded?: boolean }) {
  const { t } = useApp();
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/order-tracking', params: { orderId: order.databaseId } })} style={({ pressed }) => [styles.compactRow, !embedded && styles.compactStandalone, pressed && styles.pressed]}><View style={styles.receiptIcon}><SymbolView name={{ ios: 'doc.text', android: 'receipt-text-outline', web: 'receipt-text-outline' }} size={17} tintColor={Colors.tealDark} /></View><View style={styles.rowCopy}><View style={styles.rowHeading}><Text numberOfLines={1} style={styles.rowTitle}>{order.id}</Text><StatusBadge label={t(CUSTOMER_STATUS_LABELS[order.status])} tone={orderStatusTone(order.status)} /></View><Text numberOfLines={1} style={styles.rowMeta}>{order.itemSummary} · {formatBaht(order.amount)} · {formatBangkokDate(order.createdAt, language)}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron-right', web: 'chevron-right' }} size={17} tintColor={Colors.navy} /></Pressable>;
}

function orderStatusTone(status: CustomerOrder['status']): 'info' | 'success' | 'attention' | 'error' | 'neutral' {
  if (['delivered', 'collected'].includes(status)) return 'success';
  if (status === 'cancelled') return 'error';
  if (['ready', 'ready_for_collection'].includes(status)) return 'attention';
  if (['pending', 'accepted'].includes(status)) return 'neutral';
  return 'info';
}

function PastOrderCard({ order, language }: { order: CustomerOrder; language: string }) {
  const { t } = useApp();
  return <Card style={styles.pastCard}><CompactOrderRow order={order} language={language} embedded />{['delivered', 'collected'].includes(order.status) ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/new-order', params: { repeatOrderId: order.databaseId } })} style={styles.repeat}><SymbolView name={{ ios: 'arrow.counterclockwise', android: 'rotate-left', web: 'rotate-left' }} size={16} tintColor={Colors.tealDark} /><Text style={styles.repeatText}>{t('Repeat order')}</Text></Pressable> : null}</Card>;
}

const styles = StyleSheet.create({
  loading: { marginBottom: 12, borderRadius: Radius.large },
  segmented: { height: 46, borderRadius: 16, backgroundColor: '#E9EFEE', padding: 4, flexDirection: 'row', marginBottom: 18 },
  segmentButton: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentButtonSelected: { backgroundColor: Colors.surface, ...Shadow },
  segmentText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12 },
  segmentTextSelected: { color: Colors.navy, fontWeight: '500' },
  activeCard: { padding: 18, gap: 13, borderWidth: 1.5, borderColor: Colors.teal },
  currentOrderFlag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  currentOrderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.teal },
  currentOrderText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 10, lineHeight: 14, fontWeight: '500', letterSpacing: 1.5 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  orderNumber: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12, letterSpacing: 1.2 },
  orderService: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 19, lineHeight: 24, fontWeight: '500', marginTop: 5 },
  statusPill: { maxWidth: '46%', minHeight: 32, borderRadius: 16, backgroundColor: Colors.tealLight, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  statusPillText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500', textAlign: 'center' },
  statusPanel: { borderRadius: 17, backgroundColor: '#E9F5F3', padding: 14 },
  statusLabel: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11 },
  statusValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 18, lineHeight: 23, fontWeight: '500', marginTop: 4 },
  statusNext: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11, lineHeight: 16, marginTop: 4 },
  factRow: { flexDirection: 'row', gap: 10 },
  fact: { flex: 1, minHeight: 77, borderRadius: 16, backgroundColor: '#F3F6F5', padding: 13 },
  factLabel: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11 },
  factValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 15, lineHeight: 20, fontWeight: '500', marginTop: 5 },
  trackButton: { minHeight: 55, borderRadius: 18, backgroundColor: Colors.navy, paddingLeft: 17, paddingRight: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackButtonText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  trackCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#35C8BC', alignItems: 'center', justifyContent: 'center' },
  withdraw: { minHeight: 36, alignSelf: 'flex-end', justifyContent: 'center' },
  withdrawText: { color: Colors.coral, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500' },
  recent: { marginTop: 22 },
  activityCard: { paddingHorizontal: 15, paddingVertical: 2 },
  compactStandalone: { backgroundColor: Colors.surface, borderRadius: Radius.large, paddingHorizontal: 15, marginTop: 10, ...Shadow },
  compactRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11 },
  receiptIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 15, lineHeight: 19, fontWeight: '500' },
  rowMeta: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10, lineHeight: 15, marginTop: 3 },
  divider: { height: 1, backgroundColor: Colors.line, marginLeft: 49 },
  searchBox: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.navy, fontFamily: FontFamily, fontSize: 13 },
  pastList: { gap: 12 },
  pastCard: { paddingHorizontal: 15, overflow: 'hidden' },
  repeat: { minHeight: 44, borderTopWidth: 1, borderTopColor: Colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  repeatText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  stateCard: { padding: 18, gap: 12, marginBottom: 12 },
  emptyCard: { padding: 20, gap: 12 },
  emptyAction: { width: '100%', minWidth: 220 },
  stateTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 18, fontWeight: '500' },
  stateText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.7 },
});
