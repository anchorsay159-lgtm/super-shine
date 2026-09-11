import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AdminCard, AdminKpiCard, AdminLoadingState, AdminPage, EmptyState, ErrorState, SectionTitle, StatusBadge } from '@/admin/admin-ui';
import { OPERATIONAL_GROUPS, ORDER_STATUS_CONFIG, PAYMENT_STATUS_CONFIG, isClosedStatus, isOverdue, isPaidStatus, waitingLabel } from '@/admin/order-config';
import { useAdminOrders } from '@/admin/use-admin-orders';
import { Button } from '@/components/super-ui';
import { SymbolView, type SymbolName } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht } from '@/lib/domain';
import type { CustomerOrder } from '@/types/domain';

const DAY = 86400000;

function bangkokDay(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function timeLabel(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function oldestWaiting(orders: CustomerOrder[]) {
  const oldest = [...orders].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  return oldest ? waitingLabel(oldest.updatedAt) : '—';
}

function areaLabel(address: string) {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(', ') || '—';
}

export default function AdminOverview() {
  const { profile } = useApp();
  const { width } = useWindowDimensions();
  const { orders, messages, loading, refreshing, error, reload } = useAdminOrders(profile.role === 'admin');
  const today = bangkokDay(new Date());
  const yesterday = bangkokDay(new Date(Date.now() - DAY));
  const realOrders = orders.filter((order) => !order.isDemo);
  const todayOrders = realOrders.filter((order) => bangkokDay(order.createdAt) === today);
  const yesterdayOrders = realOrders.filter((order) => bangkokDay(order.createdAt) === yesterday);
  const todayRevenue = todayOrders.filter((order) => isPaidStatus(order.paymentStatus)).reduce((sum, order) => sum + order.amount, 0);
  const yesterdayRevenue = yesterdayOrders.filter((order) => isPaidStatus(order.paymentStatus)).reduce((sum, order) => sum + order.amount, 0);
  const revenueDelta = yesterdayRevenue ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const activeOrders = realOrders.filter((order) => !isClosedStatus(order.status));
  const awaitingPayment = activeOrders.filter((order) => !isPaidStatus(order.paymentStatus) && order.paymentStatus !== 'refunded');
  const unreadCustomerMessages = messages.filter((message) => message.senderRole === 'customer' && !message.readAt);

  const priorities = [
    queueItem('Late pickups', realOrders.filter((order) => order.collectionMethod === 'home_pickup' && Boolean(order.pickupDate && order.pickupDate < today && ['pending', 'accepted', 'pickup_in_progress'].includes(order.status))), 'critical', { view: 'late-pickups' }),
    queueItem('Late deliveries', realOrders.filter((order) => Boolean(order.deliveryEta && new Date(order.deliveryEta) < new Date() && !isClosedStatus(order.status))), 'critical', { view: 'late-deliveries' }),
    queueItem('Cancelled orders', realOrders.filter((order) => order.status === 'cancelled'), 'warning', { status: 'cancelled' }),
    queueItem('New orders awaiting confirmation', realOrders.filter((order) => order.status === 'pending'), 'warning', { view: 'needs-confirmation' }),
    queueItem('Payments awaiting confirmation', realOrders.filter((order) => order.paymentStatus === 'pending'), 'warning', { view: 'payment-verification' }),
    queueItem('Orders awaiting price approval', realOrders.filter((order) => order.priceApprovalStatus === 'pending'), 'info', { view: 'price-approval' }),
    { label: 'Unread customer messages', count: unreadCustomerMessages.length, oldest: unreadCustomerMessages.length ? waitingLabel(unreadCustomerMessages[unreadCustomerMessages.length - 1].createdAt) : '—', severity: 'info' as const, params: { view: 'messages' } },
  ];
  const visiblePriorities = priorities.some((item) => item.count) ? priorities.filter((item) => item.count) : priorities.slice(0, 3);

  const schedule = [
    ...realOrders.filter((order) => order.collectionMethod === 'home_pickup' && order.pickupDate === today && order.status !== 'cancelled').map((order) => ({ key: `pickup-${order.databaseId}`, type: 'Pickup' as const, time: order.pickupStart?.slice(0, 5) || '—', order })),
    ...realOrders.filter((order) => order.returnMethod === 'home_delivery' && order.deliveryEta && bangkokDay(order.deliveryEta) === today && order.status !== 'cancelled').map((order) => ({ key: `delivery-${order.databaseId}`, type: 'Delivery' as const, time: timeLabel(order.deliveryEta), order })),
  ].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8);
  const narrow = width < 860;
  const attentionCount = priorities.reduce((sum, item) => sum + item.count, 0);
  const overdueCount = activeOrders.filter((order) => isOverdue(order.updatedAt, order.status)).length;
  const nextRoute = schedule[0];

  const firstName = profile.name?.trim().split(/\s+/)[0] || 'team';

  return <AdminPage title="Overview" eyebrow="Operations dashboard" subtitle={`Good morning, ${firstName}. Here’s today’s schedule and the work that needs attention.`} actions={<><Button label="Refresh" icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} variant="secondary" onPress={reload} loading={refreshing} style={styles.headerButton} /><Button label="View all orders" icon={{ ios: 'list.bullet.rectangle.fill', android: 'receipt_long', web: 'receipt_long' }} onPress={() => router.push('/admin/orders')} style={styles.headerButton} /></>}>
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    {loading ? <AdminLoadingState rows={5} /> : null}
    {!loading && !error ? <>
      <AdminCard style={[styles.focusCard, narrow && styles.focusCardStack]}>
        <View style={styles.focusGlow} />
        <View style={styles.focusCopy}>
          <View style={styles.focusEyebrowRow}><View style={styles.liveDot} /><Text style={styles.focusEyebrow}>TODAY’S FOCUS</Text></View>
          <Text style={styles.focusTitle}>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention` : 'Operations are on track'}</Text>
          <Text style={styles.focusDescription}>{attentionCount ? 'The most urgent customer and workflow tasks are ready below.' : 'There are no urgent workflow exceptions right now.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/admin/orders')} style={({ pressed }) => [styles.focusAction, pressed && styles.focusActionPressed]}><Text style={styles.focusActionText}>Open order workspace</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={17} tintColor={Colors.navy} /></Pressable>
        </View>
        <View style={[styles.focusFacts, narrow && styles.focusFactsNarrow]}>
          <FocusFact icon={{ ios: 'washer.fill', android: 'local_laundry_service', web: 'local_laundry_service' }} label="Active now" value={`${activeOrders.length} orders`} />
          <FocusFact icon={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }} label="Next route" value={nextRoute ? `${nextRoute.time} · ${nextRoute.type}` : 'Schedule clear'} />
          <FocusFact icon={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat_bubble', web: 'chat_bubble' }} label="Messages" value={`${unreadCustomerMessages.length} unread`} alert={Boolean(unreadCustomerMessages.length)} />
          {overdueCount ? <View style={styles.overdueAlert}><SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }} size={16} tintColor={Colors.coral} /><Text style={styles.overdueAlertText}>{overdueCount} overdue order{overdueCount === 1 ? '' : 's'}</Text></View> : null}
        </View>
      </AdminCard>

      <View style={styles.kpiGrid}>
        <AdminKpiCard label="Orders today" icon={{ ios: 'receipt.fill', android: 'receipt_long', web: 'receipt_long' }} value={String(todayOrders.length)} note={`${yesterdayOrders.length} yesterday`} indicator={todayOrders.length ? 'positive' : 'neutral'} />
        <AdminKpiCard label="Revenue today" icon={{ ios: 'banknote.fill', android: 'payments', web: 'payments' }} value={formatBaht(todayRevenue)} note={revenueDelta == null ? 'No prior-day paid revenue' : `${revenueDelta >= 0 ? '+' : ''}${revenueDelta.toFixed(1)}% vs yesterday`} indicator={revenueDelta != null && revenueDelta < 0 ? 'warning' : 'positive'} />
        <AdminKpiCard label="Awaiting payment" icon={{ ios: 'clock.badge.exclamationmark.fill', android: 'schedule', web: 'schedule' }} value={String(awaitingPayment.length)} note={`${formatBaht(awaitingPayment.reduce((sum, order) => sum + Math.max(order.outstandingAmount, order.amount - order.amountPaid), 0))} outstanding`} indicator={awaitingPayment.length ? 'warning' : 'positive'} />
        <AdminKpiCard label="Active orders" icon={{ ios: 'washer.fill', android: 'local_laundry_service', web: 'local_laundry_service' }} value={String(activeOrders.length)} note={`${activeOrders.filter((order) => isOverdue(order.updatedAt, order.status)).length} overdue`} indicator={activeOrders.some((order) => isOverdue(order.updatedAt, order.status)) ? 'critical' : 'positive'} />
      </View>

      <View style={[styles.twoColumn, narrow && styles.stack]}>
        <View style={styles.column}><SectionTitle title="Priority queue" subtitle="Urgent operational work, sorted by severity" /><AdminCard style={styles.queue}>{visiblePriorities.map((item, index) => { const critical = item.severity === 'critical'; const warning = item.severity === 'warning'; const iconColor = critical ? Colors.coral : warning ? '#B87500' : Colors.blue; return <Pressable key={item.label} accessibilityRole="button" onPress={() => router.push({ pathname: '/admin/orders', params: item.params })} style={[styles.queueRow, index === visiblePriorities.length - 1 && styles.lastRow]}><View style={[styles.queueIcon, critical ? styles.queueIconCritical : warning ? styles.queueIconWarning : styles.queueIconInfo]}><SymbolView name={critical ? { ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' } : warning ? { ios: 'clock.badge.exclamationmark.fill', android: 'schedule', web: 'schedule' } : { ios: 'info.circle.fill', android: 'info', web: 'info' }} size={18} tintColor={iconColor} /></View><View style={styles.queueCopy}><Text style={styles.queueLabel}>{item.label}</Text><Text style={styles.queueMeta}>{item.count ? `Oldest waiting ${item.oldest}` : 'No action needed'}</Text></View><View style={[styles.queueCountBadge, !item.count && styles.queueCountBadgeQuiet]}><Text style={[styles.queueCount, !item.count && styles.queueCountQuiet]}>{item.count}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={Colors.textMuted} /></Pressable>; })}</AdminCard></View>
        <View style={styles.column}><SectionTitle title="Today’s schedule" subtitle="Next pickups and deliveries" action={<Pressable onPress={() => router.push({ pathname: '/admin/orders', params: { view: 'due-today' } })}><Text style={styles.sectionAction}>View schedule</Text></Pressable>} /><AdminCard style={styles.scheduleCard}>{schedule.length ? schedule.map((item, index) => <Pressable key={item.key} onPress={() => router.push({ pathname: '/admin/order/[id]', params: { id: item.order.databaseId } })} style={[styles.scheduleRow, index === schedule.length - 1 && styles.lastRow]}><View style={[styles.routeIcon, item.type === 'Delivery' && styles.routeIconDelivery]}><SymbolView name={item.type === 'Pickup' ? { ios: 'arrow.down.to.line', android: 'shopping_bag', web: 'shopping_bag' } : { ios: 'truck.box.fill', android: 'delivery_dining', web: 'delivery_dining' }} size={18} tintColor={item.type === 'Pickup' ? Colors.blue : Colors.tealDark} /></View><View style={styles.timeWrap}><Text style={styles.time}>{item.time}</Text><Text style={styles.routeType}>{item.type}</Text></View><View style={styles.scheduleCopy}><Text numberOfLines={1} style={styles.orderName}>#{item.order.id} · {item.order.customerName || 'Customer'}</Text><Text numberOfLines={1} style={styles.area}>{areaLabel(item.order.pickupAddress)}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} tintColor={Colors.textMuted} /></Pressable>) : <EmptyState title="Schedule clear" description="No pickups or deliveries are scheduled for today." icon={{ ios: 'calendar.badge.checkmark', android: 'calendar_month', web: 'calendar_month' }} />}</AdminCard></View>
      </View>

      <View style={styles.section}><SectionTitle title="Order pipeline" subtitle="A quick view of every operational stage" /></View>
      <View style={styles.pipeline}>{OPERATIONAL_GROUPS.map((group) => { const groupOrders = realOrders.filter((order) => group.statuses.includes(order.status)); const overdue = groupOrders.filter((order) => isOverdue(order.updatedAt, order.status)).length; const visual = GROUP_VISUALS[group.id]; return <Pressable key={group.id} onPress={() => router.push({ pathname: '/admin/orders', params: { group: group.id } })} style={[styles.pipelineRow, { borderTopColor: visual.color }]}><View style={styles.pipelineTop}><View style={[styles.pipelineIcon, { backgroundColor: visual.background }]}><SymbolView name={visual.icon} size={18} tintColor={visual.color} /></View><Text style={styles.pipelineCount}>{groupOrders.length}</Text></View><Text style={styles.pipelineLabel}>{group.label}</Text><Text style={styles.pipelineMeta}>{groupOrders.length ? `Oldest ${oldestWaiting(groupOrders)}` : 'No waiting orders'}</Text><Text style={[styles.overdue, !overdue && styles.onTrack]}>{overdue ? `${overdue} overdue` : 'On track'}</Text></Pressable>; })}</View>

      <View style={styles.section}><SectionTitle title="Recent orders" subtitle="Five newest orders" action={<Pressable onPress={() => router.push('/admin/orders')}><Text style={styles.sectionAction}>View all orders</Text></Pressable>} /></View>
      <AdminCard style={styles.recentCard}>{realOrders.length ? realOrders.slice(0, 5).map((order, index) => <Pressable key={order.databaseId} onPress={() => router.push({ pathname: '/admin/order/[id]', params: { id: order.databaseId } })} style={[styles.recentRow, narrow && styles.recentCardRow, index === Math.min(4, realOrders.length - 1) && styles.lastRow]}><View style={styles.recentOrder}><Text style={styles.orderName}>#{order.id}</Text><Text numberOfLines={1} style={styles.area}>{order.customerName || 'Customer'}</Text></View><Text numberOfLines={1} style={styles.recentService}>{order.itemSummary || order.service}</Text><Text style={styles.recentSchedule}>{order.pickupDate || 'Unscheduled'}</Text><View style={styles.recentBadge}><StatusBadge label={ORDER_STATUS_CONFIG[order.status].shortLabel} tone={ORDER_STATUS_CONFIG[order.status].tone} /></View><View style={styles.recentBadge}><StatusBadge label={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} tone={PAYMENT_STATUS_CONFIG[order.paymentStatus].tone} /></View><Text style={styles.recentTotal}>{formatBaht(order.amount)}</Text><Text style={styles.viewLink}>Open</Text></Pressable>) : <EmptyState title="No orders yet" description="New customer orders will appear here using the existing live data flow." />}</AdminCard>
    </> : null}
  </AdminPage>;
}

function queueItem(label: string, orders: CustomerOrder[], severity: 'critical' | 'warning' | 'info', params: Record<string, string>) {
  return { label, count: orders.length, oldest: oldestWaiting(orders), severity, params };
}

function FocusFact({ icon, label, value, alert = false }: { icon: SymbolName; label: string; value: string; alert?: boolean }) {
  return <View style={styles.focusFact}><View style={styles.focusFactIcon}><SymbolView name={icon} size={17} tintColor={alert ? Colors.yellow : Colors.tealLight} /></View><View style={styles.focusFactCopy}><Text style={styles.focusFactLabel}>{label}</Text><Text numberOfLines={1} style={styles.focusFactValue}>{value}</Text></View></View>;
}

const GROUP_VISUALS = {
  new: { color: Colors.blue, background: Colors.blueLight, icon: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' } },
  pickup: { color: '#B87500', background: Colors.yellowLight, icon: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping_bag' } },
  processing: { color: Colors.tealDark, background: Colors.tealLight, icon: { ios: 'washer.fill', android: 'local_laundry_service', web: 'local_laundry_service' } },
  delivery: { color: Colors.coral, background: Colors.coralLight, icon: { ios: 'truck.box.fill', android: 'delivery_dining', web: 'delivery_dining' } },
  completed: { color: Colors.success, background: Colors.successLight, icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } },
} as const;

const styles = StyleSheet.create({
  headerButton: { minHeight: 44, paddingHorizontal: 16 },
  focusCard: { minHeight: 192, flexDirection: 'row', alignItems: 'stretch', backgroundColor: Colors.navy, overflow: 'hidden', padding: 24, marginBottom: 16 },
  focusCardStack: { flexDirection: 'column', gap: 22 },
  focusGlow: { position: 'absolute', width: 360, height: 360, borderRadius: 180, right: -90, top: -220, backgroundColor: Colors.teal, opacity: 0.2 },
  focusCopy: { flex: 1.35, minWidth: 260, justifyContent: 'center', zIndex: 1 },
  focusEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.teal },
  focusEyebrow: { color: Colors.tealLight, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500', letterSpacing: 1.3 },
  focusTitle: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 27, lineHeight: 34, fontWeight: '500', letterSpacing: -0.5, marginTop: 10 },
  focusDescription: { color: '#BFD0D7', fontFamily: FontFamily, fontSize: 13, lineHeight: 20, marginTop: 6, maxWidth: 520 },
  focusAction: { alignSelf: 'flex-start', minHeight: 42, borderRadius: 14, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, marginTop: 17 },
  focusActionPressed: { opacity: 0.8 },
  focusActionText: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 12.5, fontWeight: '500' },
  focusFacts: { flex: 0.85, minWidth: 290, maxWidth: 440, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.075)', padding: 15, gap: 8, zIndex: 1 },
  focusFactsNarrow: { width: '100%', maxWidth: '100%', minWidth: 0 },
  focusFact: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10 },
  focusFactIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  focusFactCopy: { flex: 1, minWidth: 0 },
  focusFactLabel: { color: '#93AAB5', fontFamily: FontFamily, fontSize: 10.5 },
  focusFactValue: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500', marginTop: 2 },
  overdueAlert: { minHeight: 34, borderRadius: 11, backgroundColor: 'rgba(238,116,109,0.13)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginTop: 2 },
  overdueAlertText: { color: '#FFB8B2', fontFamily: FontFamilyMedium, fontSize: 11.5, fontWeight: '500' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  section: { marginTop: 31 },
  queue: { overflow: 'hidden' },
  queueRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: Colors.line },
  lastRow: { borderBottomWidth: 0 },
  queueIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  queueIconCritical: { backgroundColor: Colors.coralLight },
  queueIconWarning: { backgroundColor: Colors.yellowLight },
  queueIconInfo: { backgroundColor: Colors.blueLight },
  queueCopy: { flex: 1, minWidth: 0 },
  queueLabel: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 13.5, fontWeight: '500' },
  queueMeta: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11.5, marginTop: 5 },
  queueCountBadge: { minWidth: 32, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.coralLight, paddingHorizontal: 7 },
  queueCountBadgeQuiet: { backgroundColor: '#EEF3F2' },
  queueCount: { color: Colors.coral, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  queueCountQuiet: { color: Colors.textMuted },
  viewLink: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  twoColumn: { flexDirection: 'row', gap: 20, marginTop: 31 },
  stack: { flexDirection: 'column' },
  column: { flex: 1, minWidth: 0 },
  sectionAction: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12.5, fontWeight: '500' },
  scheduleCard: { overflow: 'hidden' },
  scheduleRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: Colors.line },
  routeIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.blueLight, alignItems: 'center', justifyContent: 'center' },
  routeIconDelivery: { backgroundColor: Colors.tealLight },
  timeWrap: { width: 64 },
  time: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 13.5, fontWeight: '500' },
  routeType: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10, marginTop: 3 },
  scheduleCopy: { flex: 1, minWidth: 0 },
  orderName: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 13.5, fontWeight: '500' },
  area: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11.5, marginTop: 4 },
  pipeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pipelineRow: { flexGrow: 1, flexBasis: 190, minWidth: 175, minHeight: 150, borderTopWidth: 4, borderRadius: Radius.large, backgroundColor: Colors.surface, padding: 17, ...Shadow },
  pipelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 11 },
  pipelineIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pipelineLabel: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500', marginTop: 13 },
  pipelineMeta: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11.5, marginTop: 5 },
  pipelineCount: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 27, fontWeight: '500' },
  overdue: { color: Colors.coral, fontFamily: FontFamilyMedium, fontSize: 11.5, fontWeight: '500', marginTop: 'auto', paddingTop: 11 },
  onTrack: { color: Colors.success },
  recentCard: { overflow: 'hidden' },
  recentRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: Colors.line },
  recentCardRow: { flexWrap: 'wrap', paddingVertical: 12 },
  recentOrder: { width: 145 },
  recentService: { flex: 1, minWidth: 140, color: Colors.text, fontFamily: FontFamily, fontSize: 12.5 },
  recentSchedule: { width: 108, color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11.5 },
  recentBadge: { width: 150 },
  recentTotal: { width: 88, color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 12.5, fontWeight: '500', textAlign: 'right' },
});
