import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { AdminCard, AdminPage, EmptyState, ErrorState, SectionTitle } from '@/admin/admin-ui';
import { isPaidStatus } from '@/admin/order-config';
import { useAdminOrders } from '@/admin/use-admin-orders';
import { Button } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium, Radius } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht } from '@/lib/domain';
import type { CustomerOrder } from '@/types/domain';

type RangePreset = '7' | '30' | '90' | 'custom';
const DAY = 86400000;

function dayKey(value: string | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value)); }
function startOfDay(value: string) { return new Date(`${value}T00:00:00+07:00`).getTime(); }
function percent(value: number | null) { return value == null ? '—' : `${Math.round(value)}%`; }
function ratio(numerator: number, denominator: number) { return denominator ? (numerator / denominator) * 100 : null; }
function statusTime(order: CustomerOrder, status: CustomerOrder['status']) { return order.history.find((entry) => entry.newStatus === status)?.createdAt; }
function pickupDeadline(order: CustomerOrder) { return order.pickupDate ? new Date(`${order.pickupDate}T${order.pickupEnd || '23:59:59'}+07:00`) : null; }

export default function AdminReports() {
  const { profile } = useApp();
  const { width } = useWindowDimensions();
  const { orders, loading, refreshing, error, reload } = useAdminOrders(profile.role === 'admin');
  const [preset, setPreset] = useState<RangePreset>('30');
  const today = dayKey(new Date());
  const [from, setFrom] = useState(dayKey(new Date(Date.now() - 29 * DAY)));
  const [to, setTo] = useState(today);
  const [exportMessage, setExportMessage] = useState('');
  const range = useMemo(() => {
    const days = preset === 'custom' ? Math.max(1, Math.round((startOfDay(to) - startOfDay(from)) / DAY) + 1) : Number(preset);
    const end = preset === 'custom' ? to : today;
    const start = preset === 'custom' ? from : dayKey(new Date(startOfDay(end) - (days - 1) * DAY));
    return { start, end, days };
  }, [from, preset, to, today]);
  const real = orders.filter((order) => !order.isDemo);
  const current = real.filter((order) => dayKey(order.createdAt) >= range.start && dayKey(order.createdAt) <= range.end);
  const previousEndMs = startOfDay(range.start) - DAY;
  const previousStartMs = previousEndMs - (range.days - 1) * DAY;
  const previous = real.filter((order) => { const time = startOfDay(dayKey(order.createdAt)); return time >= previousStartMs && time <= previousEndMs; });
  const paid = (order: CustomerOrder) => isPaidStatus(order.paymentStatus);
  const revenue = current.filter(paid).reduce((sum, order) => sum + order.amount, 0);
  const priorRevenue = previous.filter(paid).reduce((sum, order) => sum + order.amount, 0);
  const revenueChange = priorRevenue ? ((revenue - priorRevenue) / priorRevenue) * 100 : null;
  const completed = current.filter((order) => ['delivered', 'collected'].includes(order.status));
  const turnaround = completed.map((order) => (new Date(statusTime(order, order.returnMethod === 'store_collection' ? 'collected' : 'delivered') || order.updatedAt).getTime() - new Date(order.createdAt).getTime()) / 3600000);
  const avgTurnaround = turnaround.length ? turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length : null;
  const scheduledPickup = current.filter((order) => order.pickupDate);
  const onTimePickup = scheduledPickup.filter((order) => { const pickedUpAt = statusTime(order, 'picked_up'); const deadline = pickupDeadline(order); return pickedUpAt && deadline ? new Date(pickedUpAt) <= deadline : false; });
  const deliveryOrders = completed.filter((order) => order.returnMethod === 'home_delivery');
  const onTimeDelivery = deliveryOrders.filter((order) => { const deliveredAt = statusTime(order, 'delivered') || order.updatedAt; return !order.deliveryEta || new Date(deliveredAt) <= new Date(order.deliveryEta); });
  const unpaid = current.filter((order) => !paid(order) && order.paymentStatus !== 'refunded' && order.status !== 'cancelled').reduce((sum, order) => sum + Math.max(order.outstandingAmount, order.amount - order.amountPaid), 0);
  const refunded = current.filter((order) => order.paymentStatus === 'refunded').reduce((sum, order) => sum + order.amount, 0);
  const cancelled = current.filter((order) => order.status === 'cancelled').reduce((sum, order) => sum + order.amount, 0);
  const customerCounts = real.reduce<Record<string, number>>((acc, order) => ({ ...acc, [order.userId]: (acc[order.userId] || 0) + 1 }), {});
  const returningOrders = current.filter((order) => (customerCounts[order.userId] || 0) > 1);
  const couponOrders = current.filter((order) => order.couponCode);
  const couponDiscount = couponOrders.reduce((sum, order) => sum + order.discount, 0);
  const couponRevenue = couponOrders.filter(paid).reduce((sum, order) => sum + order.amount, 0);
  const metrics = [
    ['Revenue', formatBaht(revenue), revenueChange == null ? 'No prior-period revenue' : `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% vs previous period`],
    ['Orders', String(current.length), `${previous.length} in previous period`],
    ['Average order value', current.filter(paid).length ? formatBaht(revenue / current.filter(paid).length) : '—', 'Paid orders only'],
    ['Average turnaround', avgTurnaround == null ? '—' : `${avgTurnaround.toFixed(1)}h`, `${completed.length} completed orders`],
    ['On-time pickup rate', percent(ratio(onTimePickup.length, scheduledPickup.length)), `${scheduledPickup.length} scheduled pickups`],
    ['On-time delivery rate', percent(ratio(onTimeDelivery.length, deliveryOrders.length)), `${deliveryOrders.length} completed deliveries`],
    ['Unpaid amount', formatBaht(unpaid), 'Open real orders'],
    ['Returning customer rate', percent(ratio(returningOrders.length, current.length)), `${returningOrders.length} returning orders`],
  ];
  const revenueByDay = aggregateDays(current, range.start, range.end, paid);
  const revenueByService = aggregateServices(current, paid);
  const orderByService = aggregateServices(current, () => true, false);
  const paymentBreakdown = aggregatePayments(current);
  const maxDaily = Math.max(1, ...revenueByDay.map((row) => row.value));

  function setPresetRange(value: RangePreset) { setPreset(value); if (value !== 'custom') { const days = Number(value); setTo(today); setFrom(dayKey(new Date(startOfDay(today) - (days - 1) * DAY))); } }

  function exportCsv() {
    if (Platform.OS !== 'web') return setExportMessage('CSV export is available from the desktop web dashboard.');
    const headers = ['Order number','Created','Customer','Service','Order status','Payment status','Subtotal','Discount','Total','Demo'];
    const rows = current.map((order) => [order.id, order.createdAt, order.customerName || '', order.service, order.status, order.paymentStatus, order.subtotal, order.discount, order.amount, order.isDemo ? 'yes' : 'no']);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `super-shine-report-${range.start}-${range.end}.csv`; anchor.click(); URL.revokeObjectURL(url);
    setExportMessage(`${current.length} real orders exported.`);
  }

  return <AdminPage title="Reports" subtitle="Performance and revenue from real Supabase orders only." actions={<><Button label="Refresh" variant="secondary" onPress={reload} loading={refreshing} style={styles.headerButton} /><Button label="Export CSV" onPress={exportCsv} style={styles.headerButton} /></>}>
    {exportMessage ? <View style={styles.notice}><Text style={styles.noticeText}>{exportMessage}</Text></View> : null}
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    <AdminCard style={styles.rangeCard}><View style={styles.presets}>{(['7','30','90','custom'] as RangePreset[]).map((value) => <Pressable key={value} onPress={() => setPresetRange(value)} style={[styles.preset, preset === value && styles.presetActive]}><Text style={[styles.presetText, preset === value && styles.presetTextActive]}>{value === 'custom' ? 'Custom' : `${value} days`}</Text></Pressable>)}</View><View style={styles.dateFields}><DateField label="From" value={range.start} onChangeText={(value) => { setFrom(value); setPreset('custom'); }} /><DateField label="To" value={range.end} onChangeText={(value) => { setTo(value); setPreset('custom'); }} /><View style={styles.rangeSummary}><Text style={styles.rangeSummaryLabel}>Comparison</Text><Text style={styles.rangeSummaryValue}>Previous {range.days} days</Text></View></View></AdminCard>

    {!loading && current.length === 0 && !error ? <AdminCard style={styles.emptyCard}><EmptyState title="No records in this period" description="Choose another date range. Reports never substitute demo or placeholder records." /></AdminCard> : null}
    {loading ? <View style={styles.metricGrid}>{[1,2,3,4,5,6,7,8].map((item) => <View key={item} style={styles.skeleton} />)}</View> : null}
    {!loading && current.length ? <>
      <View style={styles.metricGrid}>{metrics.map(([label, value, note]) => <AdminCard key={label} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></AdminCard>)}</View>
      <View style={[styles.chartGrid, width < 1050 && styles.chartGridStack]}><View style={styles.chartColumn}><SectionTitle title="Revenue trend" subtitle={`${range.start} to ${range.end}`} /><AdminCard style={styles.chartCard}><View style={styles.barChart}>{revenueByDay.map((row) => <View key={row.label} style={styles.barColumn}><Text style={styles.barValue}>{row.value ? compactMoney(row.value) : ''}</Text><View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max(row.value ? 8 : 1, (row.value / maxDaily) * 100)}%` }]} /></View><Text style={styles.barLabel}>{row.label.slice(5)}</Text></View>)}</View></AdminCard></View><View style={styles.chartColumn}><SectionTitle title="Revenue by service" subtitle="Paid orders only" /><AdminCard style={styles.chartCard}><RankedBars rows={revenueByService} money /></AdminCard></View></View>
      <View style={[styles.chartGrid, width < 1050 && styles.chartGridStack]}><View style={styles.chartColumn}><SectionTitle title="Orders by service" subtitle={`${current.length} real orders`} /><AdminCard style={styles.chartCard}><RankedBars rows={orderByService} /></AdminCard></View><View style={styles.chartColumn}><SectionTitle title="Payment method breakdown" subtitle="Selected checkout method" /><AdminCard style={styles.chartCard}><RankedBars rows={paymentBreakdown} /></AdminCard></View></View>
      <View style={[styles.contextGrid, width < 760 && styles.contextGridStack]}><ContextMetric label="Refund value" value={formatBaht(refunded)} note={`${current.filter((order) => order.paymentStatus === 'refunded').length} refunded orders`} /><ContextMetric label="Cancellation value" value={formatBaht(cancelled)} note={`${current.filter((order) => order.status === 'cancelled').length} cancelled orders`} /><ContextMetric label="Coupon usage" value={`${couponOrders.length} orders`} note={`${formatBaht(couponDiscount)} discount · ${formatBaht(couponRevenue)} revenue`} /></View>
    </> : null}
  </AdminPage>;
}

function aggregateDays(orders: CustomerOrder[], start: string, end: string, include: (order: CustomerOrder) => boolean) {
  const rows: { label: string; value: number }[] = [];
  for (let time = startOfDay(start); time <= startOfDay(end); time += DAY) { const key = dayKey(new Date(time)); rows.push({ label: key, value: orders.filter((order) => dayKey(order.createdAt) === key && include(order)).reduce((sum, order) => sum + order.amount, 0) }); }
  return rows.length > 31 ? rows.filter((_, index) => index % Math.ceil(rows.length / 30) === 0) : rows;
}

function aggregateServices(orders: CustomerOrder[], include: (order: CustomerOrder) => boolean, money = true) {
  const values: Record<string, number> = {};
  orders.filter(include).forEach((order) => order.items.forEach((item) => { values[item.serviceName || 'Other'] = (values[item.serviceName || 'Other'] || 0) + (money ? (item.finalLineTotal ?? item.lineTotal) : item.quantity); }));
  return Object.entries(values).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function aggregatePayments(orders: CustomerOrder[]) { const values: Record<string, number> = {}; orders.forEach((order) => { const label = ({ cash_pickup: 'Cash at collection', cash_delivery: 'Cash at delivery', promptpay: 'PromptPay' } as Record<string,string>)[order.paymentMethod] || order.paymentMethod; values[label] = (values[label] || 0) + 1; }); return Object.entries(values).map(([label,value]) => ({ label, value })).sort((a,b) => b.value - a.value); }
function compactMoney(value: number) { return value >= 1000 ? `฿${(value / 1000).toFixed(1)}k` : `฿${Math.round(value)}`; }

function RankedBars({ rows, money }: { rows: { label: string; value: number }[]; money?: boolean }) { const max = Math.max(1, ...rows.map((row) => row.value)); return <View style={styles.rankedBars}>{rows.length ? rows.slice(0, 7).map((row) => <View key={row.label} style={styles.rankRow}><View style={styles.rankHeader}><Text style={styles.rankLabel}>{row.label}</Text><Text style={styles.rankValue}>{money ? formatBaht(row.value) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(row.value)}</Text></View><View style={styles.rankTrack}><View style={[styles.rankFill, { width: `${Math.max(3, (row.value / max) * 100)}%` }]} /></View></View>) : <EmptyState title="No breakdown available" description="The selected period has no matching records." />}</View>; }
function DateField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.dateField}><Text style={styles.dateLabel}>{label}</Text><TextInput {...props} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} style={styles.dateInput} /></View>; }
function ContextMetric({ label, value, note }: { label: string; value: string; note: string }) { return <AdminCard style={styles.contextMetric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.contextValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></AdminCard>; }

const styles = StyleSheet.create({
  headerButton: { minHeight: 40, paddingHorizontal: 14 }, notice: { alignSelf: 'flex-end', backgroundColor: Colors.successLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }, noticeText: { color: Colors.success, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, rangeCard: { padding: 16 }, presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, preset: { minHeight: 36, borderRadius: 12, borderWidth: 0, backgroundColor: '#EEF3F2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, presetActive: { backgroundColor: Colors.navy }, presetText: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, presetTextActive: { color: Colors.surface },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 13 }, dateField: { flexGrow: 1, flexBasis: 180 }, dateLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', marginBottom: 6, textTransform: 'uppercase' }, dateInput: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, color: Colors.text, fontFamily: FontFamily, paddingHorizontal: 11, fontSize: 10.5 }, rangeSummary: { flexGrow: 1, flexBasis: 180, minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: Colors.tealLight, borderRadius: 12, marginTop: 14 }, rangeSummaryLabel: { color: Colors.tealDark, fontFamily: FontFamily, fontSize: 8 }, rangeSummaryValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500', marginTop: 2 }, emptyCard: { marginTop: 16 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 16 }, metric: { flexGrow: 1, flexBasis: 220, minWidth: 180, padding: 17, borderTopWidth: 3, borderTopColor: Colors.teal }, metricLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, metricValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 22, fontWeight: '500', marginTop: 8 }, metricNote: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9, lineHeight: 14, marginTop: 4 }, skeleton: { height: 110, flexGrow: 1, flexBasis: 220, backgroundColor: '#E7EFED', borderRadius: Radius.medium },
  chartGrid: { flexDirection: 'row', gap: 17, marginTop: 30 }, chartGridStack: { flexDirection: 'column' }, chartColumn: { flex: 1, minWidth: 0 }, chartCard: { minHeight: 290, padding: 18 }, barChart: { height: 242, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }, barColumn: { flex: 1, height: '100%', minWidth: 12, alignItems: 'center', justifyContent: 'flex-end' }, barValue: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 7, height: 14 }, barTrack: { flex: 1, width: '70%', maxWidth: 24, backgroundColor: '#EEF3F2', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' }, bar: { width: '100%', backgroundColor: Colors.teal, borderRadius: 6 }, barLabel: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 7, marginTop: 5, transform: [{ rotate: '-35deg' }] }, rankedBars: { gap: 15 }, rankRow: { gap: 6 }, rankHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, rankLabel: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, rankValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, rankTrack: { height: 8, borderRadius: 4, backgroundColor: '#EEF3F2', overflow: 'hidden' }, rankFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.teal },
  contextGrid: { flexDirection: 'row', gap: 11, marginTop: 30 }, contextGridStack: { flexDirection: 'column' }, contextMetric: { flex: 1, padding: 17 }, contextValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 17, fontWeight: '500', marginTop: 6 },
});
