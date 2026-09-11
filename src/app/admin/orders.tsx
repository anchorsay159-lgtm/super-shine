import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { AdminCard, AdminFilterBar, AdminPage, EmptyState, ErrorState, StatusBadge } from '@/admin/admin-ui';
import { OPERATIONAL_GROUPS, ORDER_STATUS_CONFIG, PAYMENT_STATUS_CONFIG, isOverdue, primaryNextStatus, statusLabel, waitingLabel, type OperationalGroupId } from '@/admin/order-config';
import { useAdminOrders } from '@/admin/use-admin-orders';
import { Button } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht, formatBangkokDate } from '@/lib/domain';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder, OrderStatus, PaymentStatus } from '@/types/domain';

type SavedView = 'all' | 'needs-confirmation' | 'price-approval' | 'due-today' | 'late-orders' | 'unpaid' | 'ready-delivery' | 'payment-verification' | 'late-pickups' | 'late-deliveries' | 'messages' | 'demo';
type SortKey = 'newest' | 'oldest' | 'waiting' | 'total-high' | 'total-low';
const PAGE_SIZE = 15;
const STATUS_FILTERS: ('all' | OrderStatus)[] = ['all', 'pending', 'accepted', 'pickup_in_progress', 'picked_up', 'awaiting_dropoff', 'received_at_store', 'processing', 'ready', 'ready_for_collection', 'out_for_delivery', 'delivered', 'collected', 'cancelled'];
const PAYMENT_FILTERS: ('all' | PaymentStatus)[] = ['all', 'unpaid', 'pending', 'paid', 'partially_paid', 'failed', 'expired', 'refunded'];

function safePrimaryNext(order: CustomerOrder) {
  const next = primaryNextStatus(order);
  if (order.isDemo) return next;
  if (order.collectionMethod === 'home_pickup' && (
    (order.status === 'accepted' && next === 'pickup_in_progress') ||
    (order.status === 'pickup_in_progress' && next === 'picked_up')
  )) return null;
  if (order.returnMethod === 'home_delivery' && (
    (order.status === 'ready' && next === 'out_for_delivery') ||
    (order.status === 'out_for_delivery' && next === 'delivered')
  )) return null;
  return next;
}
const SAVED_VIEWS: { id: SavedView; label: string }[] = [
  { id: 'all', label: 'All real orders' }, { id: 'needs-confirmation', label: 'Needs confirmation' },
  { id: 'price-approval', label: 'Price approval' }, { id: 'due-today', label: 'Due today' },
  { id: 'late-orders', label: 'Late orders' }, { id: 'unpaid', label: 'Unpaid' },
  { id: 'ready-delivery', label: 'Ready for delivery' }, { id: 'payment-verification', label: 'Verify payments' },
  { id: 'demo', label: 'Demo orders' },
];

function todayBangkok() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()); }

export default function AdminOrders() {
  const params = useLocalSearchParams<{ search?: string; status?: OrderStatus; view?: SavedView; group?: OperationalGroupId }>();
  const { profile } = useApp();
  const { width } = useWindowDimensions();
  const { orders, messages, loading, refreshing, error, reload } = useAdminOrders(profile.role === 'admin');
  const [search, setSearch] = useState(params.search || '');
  const [view, setView] = useState<SavedView>(params.view || 'all');
  const [status, setStatus] = useState<'all' | OrderStatus>(params.status || 'all');
  const [payment, setPayment] = useState<'all' | PaymentStatus>('all');
  const [service, setService] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [operationalGroup, setOperationalGroup] = useState<OperationalGroupId | null>(params.group || null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<CustomerOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const desktop = width >= 940;
  const today = todayBangkok();
  const unreadMessageOrders = useMemo(() => new Set<string>(messages.flatMap((message) => message.senderRole === 'customer' && !message.readAt && message.orderId ? [message.orderId] : [])), [messages]);
  const services = [...new Set(orders.flatMap((order) => order.items.map((item) => item.serviceName)).filter(Boolean))].sort();

  useEffect(() => { setPage(1); setSelected([]); }, [search, view, status, payment, service, dateFrom, dateTo, sort, operationalGroup]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = orders.filter((order) => {
      const haystack = `${order.id} ${order.customerName || ''} ${order.customerEmail || ''} ${order.contactPhone} ${order.service}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (status !== 'all' && order.status !== status) return false;
      if (payment !== 'all' && order.paymentStatus !== payment) return false;
      if (service !== 'all' && !order.items.some((item) => item.serviceName === service)) return false;
      const group = OPERATIONAL_GROUPS.find((item) => item.id === operationalGroup);
      if (group && !group.statuses.includes(order.status)) return false;
      const createdDay = order.createdAt.slice(0, 10);
      if (dateFrom && createdDay < dateFrom) return false;
      if (dateTo && createdDay > dateTo) return false;
      if (view === 'demo') return order.isDemo;
      if (view === 'all' && order.isDemo) return false;
      if (view === 'needs-confirmation') return !order.isDemo && order.status === 'pending';
      if (view === 'price-approval') return !order.isDemo && order.priceApprovalStatus === 'pending';
      if (view === 'due-today') return !order.isDemo && (order.pickupDate === today || (order.deliveryEta || '').slice(0, 10) === today);
      if (view === 'late-orders') return !order.isDemo && !['delivered', 'collected', 'cancelled'].includes(order.status) && ((order.collectionMethod === 'home_pickup' && order.pickupDate && order.pickupDate < today) || (order.returnMethod === 'home_delivery' && order.deliveryEta && new Date(order.deliveryEta) < new Date()));
      if (view === 'unpaid') return !order.isDemo && order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded';
      if (view === 'ready-delivery') return !order.isDemo && ['ready', 'ready_for_collection'].includes(order.status);
      if (view === 'payment-verification') return !order.isDemo && order.paymentStatus === 'pending';
      if (view === 'late-pickups') return !order.isDemo && order.collectionMethod === 'home_pickup' && Boolean(order.pickupDate && order.pickupDate < today && ['pending', 'accepted', 'pickup_in_progress'].includes(order.status));
      if (view === 'late-deliveries') return !order.isDemo && order.returnMethod === 'home_delivery' && Boolean(order.deliveryEta && new Date(order.deliveryEta) < new Date() && !['delivered', 'cancelled'].includes(order.status));
      if (view === 'messages') return unreadMessageOrders.has(order.databaseId);
      return !order.isDemo;
    });
    result = [...result].sort((a, b) => {
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sort === 'waiting') return a.updatedAt.localeCompare(b.updatedAt);
      if (sort === 'total-high') return b.amount - a.amount;
      if (sort === 'total-low') return a.amount - b.amount;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return result;
  }, [dateFrom, dateTo, operationalGroup, orders, payment, search, service, sort, status, today, unreadMessageOrders, view]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedOrders = orders.filter((order) => selected.includes(order.databaseId));
  const commonNext = selectedOrders.length && safePrimaryNext(selectedOrders[0]) && selectedOrders.every((order) => safePrimaryNext(order) === safePrimaryNext(selectedOrders[0])) ? safePrimaryNext(selectedOrders[0]) : null;

  async function updateStatus(ids: string[], nextStatus: OrderStatus) {
    if (!supabase || saving || ids.length === 0) return;
    const client = supabase;
    const targets = orders.filter((order) => ids.includes(order.databaseId));
    if (targets.some((order) => safePrimaryNext(order) !== nextStatus)) return Alert.alert('Invalid transition', 'One or more orders require the assigned driver to record this transport action.');
    setSaving(true);
    const results = await Promise.all(ids.map((id) => client.rpc('admin_update_order_status_v20', { p_order_id: id, p_next_status: nextStatus, p_comment: `Updated to ${statusLabel(nextStatus)} by admin` })));
    const updateError = results.find((result) => result.error)?.error;
    setSaving(false);
    if (updateError) return Alert.alert('Update failed', 'The order status could not be updated. Please try again.');
    setToast(`${ids.length} ${ids.length === 1 ? 'order' : 'orders'} updated to ${statusLabel(nextStatus)}.`);
    setSelected([]);
    setPreview(null);
    reload();
  }

  function confirmBulk() {
    if (!commonNext) return;
    Alert.alert('Update selected orders?', `${selected.length} orders will move to ${statusLabel(commonNext)}.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Update', onPress: () => void updateStatus(selected, commonNext) }]);
  }

  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  const activeFilterCount = [status !== 'all', payment !== 'all', service !== 'all', Boolean(dateFrom), Boolean(dateTo), sort !== 'newest', Boolean(operationalGroup)].filter(Boolean).length;
  function clearFilters() { setStatus('all'); setPayment('all'); setService('all'); setDateFrom(''); setDateTo(''); setSort('newest'); setOperationalGroup(null); }

  return <AdminPage title="Orders" subtitle={`${filtered.length} matching orders · Real orders are shown by default`} searchValue={search} onSearch={setSearch} actions={<Button label="Refresh" variant="secondary" onPress={reload} loading={refreshing} style={styles.headerButton} />}>
    {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    <AdminFilterBar>
      <View style={styles.filterToolbar}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedViews}>{SAVED_VIEWS.map((item) => <Pressable key={item.id} onPress={() => { setView(item.id); setOperationalGroup(null); }} style={[styles.savedView, view === item.id && !operationalGroup && styles.savedViewActive]}><Text style={[styles.savedViewText, view === item.id && !operationalGroup && styles.savedViewTextActive]}>{item.label}</Text></Pressable>)}</ScrollView><View style={styles.filterActions}><Button label={`Filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`} variant="secondary" onPress={() => setFiltersOpen((value) => !value)} style={styles.filterButton} />{activeFilterCount ? <Button label="Clear" variant="ghost" onPress={clearFilters} style={styles.filterButton} /> : null}</View></View>
      {operationalGroup ? <View style={styles.groupFilter}><Text style={styles.groupFilterText}>Pipeline: {OPERATIONAL_GROUPS.find((item) => item.id === operationalGroup)?.label}</Text><Pressable onPress={() => setOperationalGroup(null)}><Text style={styles.groupFilterClear}>Remove</Text></Pressable></View> : null}
      {filtersOpen ? <View style={styles.filterGrid}>
        <FilterSelect label="Order status" value={status} options={STATUS_FILTERS} onChange={(value) => setStatus(value as 'all' | OrderStatus)} labelFor={(value) => value === 'all' ? 'All statuses' : ORDER_STATUS_CONFIG[value as OrderStatus].shortLabel} />
        <FilterSelect label="Payment" value={payment} options={PAYMENT_FILTERS} onChange={(value) => setPayment(value as 'all' | PaymentStatus)} labelFor={(value) => value === 'all' ? 'All payments' : PAYMENT_STATUS_CONFIG[value as PaymentStatus].label} />
        <FilterSelect label="Service" value={service} options={['all', ...services]} onChange={setService} labelFor={(value) => value === 'all' ? 'All services' : value} />
        <FilterSelect label="Sort" value={sort} options={['newest', 'oldest', 'waiting', 'total-high', 'total-low']} onChange={(value) => setSort(value as SortKey)} labelFor={(value) => ({ newest: 'Newest first', oldest: 'Oldest first', waiting: 'Longest waiting', 'total-high': 'Highest total', 'total-low': 'Lowest total' }[value] || value)} />
        <LabeledInput label="From" value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" />
        <LabeledInput label="To" value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" />
      </View> : null}
    </AdminFilterBar>

    {selected.length ? <View style={styles.bulkBar}><Text style={styles.bulkText}>{selected.length} selected</Text><Button label="Clear" variant="ghost" onPress={() => setSelected([])} style={styles.bulkButton} />{commonNext ? <Button label={`Move to ${ORDER_STATUS_CONFIG[commonNext].shortLabel}`} onPress={confirmBulk} loading={saving} style={styles.bulkButton} /> : <Text style={styles.bulkHint}>Select orders with the same valid next action.</Text>}</View> : null}

    {loading ? <View style={styles.loader}><ActivityIndicator color={Colors.teal} /></View> : null}
    {!loading && !error && pageRows.length === 0 ? <AdminCard><EmptyState title="No matching orders" description="Try another saved view, search term, or filter combination." /></AdminCard> : null}
    {!loading && pageRows.length ? desktop ? <OrderTable rows={pageRows} selected={selected} unreadMessageOrders={unreadMessageOrders} onToggle={toggle} onPreview={setPreview} onAdvance={(order, next) => void updateStatus([order.databaseId], next)} saving={saving} /> : <View style={styles.cardList}>{pageRows.map((order) => <OrderCard key={order.databaseId} order={order} unread={unreadMessageOrders.has(order.databaseId)} selected={selected.includes(order.databaseId)} onToggle={() => toggle(order.databaseId)} onPreview={() => setPreview(order)} />)}</View> : null}

    {!loading && filtered.length ? <View style={styles.pagination}><Text style={styles.paginationText}>Page {page} of {pages} · {filtered.length} orders</Text><View style={styles.paginationButtons}><Button label="Previous" variant="secondary" disabled={page === 1} onPress={() => setPage((value) => Math.max(1, value - 1))} style={styles.pageButton} /><Button label="Next" variant="secondary" disabled={page === pages} onPress={() => setPage((value) => Math.min(pages, value + 1))} style={styles.pageButton} /></View></View> : null}
    <OrderDrawer order={preview} visible={Boolean(preview)} saving={saving} onClose={() => setPreview(null)} onAdvance={(order, next) => void updateStatus([order.databaseId], next)} />
  </AdminPage>;
}

function OrderTable({ rows, selected, unreadMessageOrders, onToggle, onPreview, onAdvance, saving }: { rows: CustomerOrder[]; selected: string[]; unreadMessageOrders: Set<string>; onToggle: (id: string) => void; onPreview: (order: CustomerOrder) => void; onAdvance: (order: CustomerOrder, status: OrderStatus) => void; saving: boolean }) {
  return <AdminCard style={styles.tableWrap}><ScrollView horizontal showsHorizontalScrollIndicator><ScrollView stickyHeaderIndices={[0]} style={styles.tableViewport} contentContainerStyle={styles.table}><View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.th, styles.checkboxCol]}>Select</Text><Text style={[styles.th, styles.orderCol]}>Order</Text><Text style={[styles.th, styles.customerCol]}>Customer</Text><Text style={[styles.th, styles.scheduleCol]}>Schedule</Text><Text style={[styles.th, styles.serviceCol]}>Service</Text><Text style={[styles.th, styles.statusCol]}>Order status</Text><Text style={[styles.th, styles.paymentCol]}>Payment</Text><Text style={[styles.th, styles.totalCol]}>Total</Text><Text style={[styles.th, styles.waitingCol]}>Waiting</Text><Text style={[styles.th, styles.actionCol]}>Primary action</Text></View>{rows.map((order) => { const next = safePrimaryNext(order); const overdue = isOverdue(order.updatedAt, order.status); const balanceDue = order.outstandingAmount > 0 && order.paymentStatus !== 'paid'; return <Pressable key={order.databaseId} onPress={() => onPreview(order)} style={({ pressed }) => [styles.tableRow, pressed && styles.rowPressed]}><View style={styles.checkboxCol}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(order.databaseId) }} onPress={(event) => { event.stopPropagation(); onToggle(order.databaseId); }} style={[styles.checkbox, selected.includes(order.databaseId) && styles.checkboxActive]}><Text style={styles.checkText}>{selected.includes(order.databaseId) ? '✓' : ''}</Text></Pressable></View><View style={styles.orderCol}><View style={styles.markerRow}><Text style={styles.orderNumber}>#{order.id}</Text>{unreadMessageOrders.has(order.databaseId) ? <View accessibilityLabel="Unread customer message" style={styles.messageMarker} /> : null}{order.paymentStatus === 'pending' ? <Text style={styles.paymentMarker}>PAY</Text> : null}</View>{order.isDemo ? <Text style={styles.demoText}>DEMO</Text> : null}</View><View style={styles.customerCol}><Text numberOfLines={1} style={styles.cellStrong}>{order.customerName || 'Customer'}</Text><Text numberOfLines={1} style={styles.cellMuted}>{order.contactPhone || order.customerEmail || '—'}</Text></View><View style={styles.scheduleCol}><Text style={styles.cellStrong}>{order.pickupDate || 'Unscheduled'}</Text><Text style={styles.cellMuted}>{order.pickupStart ? `${order.pickupStart.slice(0,5)}–${order.pickupEnd?.slice(0,5)}` : '—'}</Text></View><Text numberOfLines={2} style={[styles.cell, styles.serviceCol]}>{order.itemSummary || order.service}</Text><View style={styles.statusCol}><StatusBadge label={ORDER_STATUS_CONFIG[order.status].shortLabel} tone={ORDER_STATUS_CONFIG[order.status].tone} /></View><View style={styles.paymentCol}><StatusBadge label={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} tone={PAYMENT_STATUS_CONFIG[order.paymentStatus].tone} /></View><View style={styles.totalCol}><Text style={styles.cellStrong}>{formatBaht(order.amount)}</Text>{balanceDue ? <Text style={styles.waitingOverdue}>{formatBaht(order.outstandingAmount)} due</Text> : null}</View><Text style={[styles.cell, styles.waitingCol, overdue && styles.waitingOverdue]}>{waitingLabel(order.updatedAt)}</Text><View style={styles.actionCol}>{balanceDue ? <Pressable onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/admin/order/[id]', params: { id: order.databaseId } }); }} style={styles.inlineAction}><Text style={styles.inlineActionText}>Record payment</Text></Pressable> : next ? <Pressable disabled={saving} onPress={(event) => { event.stopPropagation(); onAdvance(order, next); }} style={styles.inlineAction}><Text style={styles.inlineActionText}>{ORDER_STATUS_CONFIG[next].shortLabel}</Text></Pressable> : <Text style={styles.cellMuted}>Review</Text>}</View></Pressable>; })}</ScrollView></ScrollView></AdminCard>;
}

function OrderCard({ order, unread, selected, onToggle, onPreview }: { order: CustomerOrder; unread: boolean; selected: boolean; onToggle: () => void; onPreview: () => void }) {
  const overdue = isOverdue(order.updatedAt, order.status);
  return <AdminCard style={styles.orderCard}><Pressable onPress={onPreview} style={styles.orderCardBody}><View style={styles.orderCardTop}><View><View style={styles.markerRow}><Text style={styles.orderNumber}>#{order.id} {order.isDemo ? '· DEMO' : ''}</Text>{unread ? <View accessibilityLabel="Unread customer message" style={styles.messageMarker} /> : null}{order.paymentStatus === 'pending' ? <Text style={styles.paymentMarker}>PAY</Text> : null}</View><Text style={styles.cardCustomer}>{order.customerName || 'Customer'}</Text></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggle} style={[styles.checkbox, selected && styles.checkboxActive]}><Text style={styles.checkText}>{selected ? '✓' : ''}</Text></Pressable></View><Text numberOfLines={2} style={styles.cardService}>{order.itemSummary || order.service}</Text><View style={styles.cardBadges}><StatusBadge label={ORDER_STATUS_CONFIG[order.status].shortLabel} tone={ORDER_STATUS_CONFIG[order.status].tone} /><StatusBadge label={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} tone={PAYMENT_STATUS_CONFIG[order.paymentStatus].tone} /></View><View style={styles.cardBottom}><Text style={[styles.cellMuted, overdue && styles.waitingOverdue]}>{order.pickupDate || 'Unscheduled'} · {waitingLabel(order.updatedAt)} waiting</Text><Text style={styles.cardAmount}>{formatBaht(order.amount)}</Text></View></Pressable></AdminCard>;
}

function OrderDrawer({ order, visible, saving, onClose, onAdvance }: { order: CustomerOrder | null; visible: boolean; saving: boolean; onClose: () => void; onAdvance: (order: CustomerOrder, status: OrderStatus) => void }) {
  if (!order) return null;
  const next = safePrimaryNext(order);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modal}><Pressable accessibilityLabel="Close order preview" style={styles.modalBackdrop} onPress={onClose} /><View style={styles.drawer}><View style={styles.drawerHeader}><View><Text style={styles.drawerEyebrow}>ORDER #{order.id}</Text><Text style={styles.drawerTitle}>{order.customerName || 'Customer'}</Text></View><Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.drawerContent}><View style={styles.drawerBadges}><StatusBadge label={ORDER_STATUS_CONFIG[order.status].label} tone={ORDER_STATUS_CONFIG[order.status].tone} /><StatusBadge label={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} tone={PAYMENT_STATUS_CONFIG[order.paymentStatus].tone} /></View><PreviewSection label="Service" value={order.itemSummary || order.service || '—'} /><PreviewSection label="Pickup" value={`${order.pickupDate || 'Unscheduled'} · ${order.pickupStart?.slice(0,5) || '—'}–${order.pickupEnd?.slice(0,5) || '—'}`} /><PreviewSection label="Address" value={order.pickupAddress || '—'} /><PreviewSection label="Contact" value={`${order.contactPhone || '—'}${order.customerEmail ? ` · ${order.customerEmail}` : ''}`} /><View style={styles.previewPrice}><Text style={styles.previewPriceLabel}>Order total</Text><Text style={styles.previewPriceValue}>{formatBaht(order.amount)}</Text></View><Text style={styles.drawerSectionTitle}>Recent activity</Text>{order.history.slice(-4).reverse().map((entry) => <View key={entry.id} style={styles.timelineRow}><View style={styles.timelineDot} /><View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{ORDER_STATUS_CONFIG[entry.newStatus].label}</Text><Text style={styles.cellMuted}>{formatBangkokDate(entry.createdAt)}</Text>{entry.comment ? <Text style={styles.timelineComment}>{entry.comment}</Text> : null}</View></View>)}</ScrollView><View style={styles.drawerFooter}>{next ? <Button label={`Move to ${ORDER_STATUS_CONFIG[next].shortLabel}`} onPress={() => onAdvance(order, next)} loading={saving} style={styles.drawerPrimary} /> : null}<Button label="Open full order" variant={next ? 'secondary' : 'primary'} onPress={() => { onClose(); router.push({ pathname: '/admin/order/[id]', params: { id: order.databaseId } }); }} style={styles.drawerPrimary} /></View></View></View></Modal>;
}

function PreviewSection({ label, value }: { label: string; value: string }) { return <View style={styles.previewSection}><Text style={styles.previewLabel}>{label}</Text><Text style={styles.previewValue}>{value}</Text></View>; }

function FilterSelect({ label, value, options, onChange, labelFor }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; labelFor: (value: string) => string }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.filterField}><Text style={styles.filterLabel}>{label}</Text><Pressable onPress={() => setOpen((current) => !current)} style={styles.selectButton}><Text numberOfLines={1} style={styles.selectText}>{labelFor(value)}</Text><Text style={styles.selectChevron}>⌄</Text></Pressable>{open ? <View style={styles.selectMenu}>{options.map((option) => <Pressable key={option} onPress={() => { onChange(option); setOpen(false); }} style={[styles.selectOption, value === option && styles.selectOptionActive]}><Text style={[styles.selectOptionText, value === option && styles.selectOptionTextActive]}>{labelFor(option)}</Text></Pressable>)}</View> : null}</View>;
}

function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.filterField}><Text style={styles.filterLabel}>{label}</Text><TextInput {...props} placeholderTextColor={Colors.textMuted} style={styles.dateInput} /></View>; }

const styles = StyleSheet.create({
  headerButton: { minHeight: 40, paddingHorizontal: 16 }, toast: { position: 'absolute', top: 0, right: 24, zIndex: 80, backgroundColor: Colors.success, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, ...Shadow }, toastText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500' },
  filterToolbar: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 30 }, savedViews: { gap: 7, paddingRight: 10 }, filterActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, filterButton: { minHeight: 38, paddingHorizontal: 11 }, savedView: { minHeight: 36, borderRadius: 12, borderWidth: 0, backgroundColor: '#EEF3F2', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, savedViewActive: { backgroundColor: Colors.navy }, savedViewText: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, savedViewTextActive: { color: Colors.surface },
  groupFilter: { minHeight: 36, borderRadius: 12, backgroundColor: Colors.blueLight, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, groupFilterText: { color: Colors.blue, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, groupFilterClear: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, zIndex: 40, paddingTop: 4 }, filterField: { flexGrow: 1, flexBasis: 150, minWidth: 130, position: 'relative' }, filterLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  selectButton: { height: 42, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface }, selectText: { flex: 1, color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500' }, selectChevron: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 15 }, selectMenu: { position: 'absolute', top: 63, left: 0, right: 0, maxHeight: 280, borderWidth: 0, backgroundColor: Colors.surface, borderRadius: 13, padding: 6, zIndex: 100, boxShadow: '0 12px 28px rgba(20,45,61,0.14)' }, selectOption: { minHeight: 36, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 9 }, selectOptionActive: { backgroundColor: Colors.tealLight }, selectOptionText: { color: Colors.text, fontFamily: FontFamily, fontSize: 10 }, selectOptionTextActive: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontWeight: '500' }, dateInput: { height: 42, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, paddingHorizontal: 11, color: Colors.text, fontFamily: FontFamily, fontSize: 10.5, backgroundColor: Colors.surface },
  bulkBar: { minHeight: 56, marginTop: 12, borderRadius: Radius.medium, backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 15, paddingVertical: 7, ...Shadow }, bulkText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' }, bulkHint: { color: '#BFD0DC', fontFamily: FontFamily, fontSize: 10, marginLeft: 'auto' }, bulkButton: { minHeight: 36, paddingHorizontal: 12, marginLeft: 'auto' }, loader: { minHeight: 320, alignItems: 'center', justifyContent: 'center' },
  tableWrap: { marginTop: 13, overflow: 'hidden' }, tableViewport: { maxHeight: 660 }, table: { minWidth: 1280 }, tableRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: 8 }, tableHeader: { minHeight: 44, backgroundColor: '#F0F5F4', zIndex: 2 }, th: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.55 }, checkboxCol: { width: 60, alignItems: 'center' }, orderCol: { width: 105 }, customerCol: { width: 180 }, serviceCol: { width: 180 }, scheduleCol: { width: 145 }, statusCol: { width: 150 }, paymentCol: { width: 145 }, totalCol: { width: 90 }, waitingCol: { width: 80 }, actionCol: { width: 150 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { backgroundColor: Colors.teal, borderColor: Colors.teal }, checkText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500' }, markerRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, messageMarker: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.blue }, paymentMarker: { color: '#9A6100', backgroundColor: Colors.yellowLight, borderRadius: 5, overflow: 'hidden', paddingHorizontal: 4, paddingVertical: 2, fontFamily: FontFamilyMedium, fontSize: 6, fontWeight: '500' }, orderNumber: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500' }, demoText: { color: Colors.blue, fontFamily: FontFamilyMedium, fontSize: 7.5, fontWeight: '500', marginTop: 3 },
  cell: { color: Colors.text, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 15, paddingRight: 10 }, cellStrong: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500', paddingRight: 10 }, cellMuted: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5, marginTop: 3 }, waitingOverdue: { color: Colors.coral, fontFamily: FontFamilyMedium, fontWeight: '500' }, rowPressed: { backgroundColor: Colors.canvas }, inlineAction: { alignSelf: 'flex-start', minHeight: 33, borderRadius: 10, backgroundColor: Colors.teal, justifyContent: 'center', paddingHorizontal: 11 }, inlineActionText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500' },
  cardList: { gap: 11, marginTop: 13 }, orderCard: { padding: 16 }, orderCardBody: { gap: 11 }, orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, cardCustomer: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500', marginTop: 4 }, cardService: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10.5, lineHeight: 17 }, cardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }, cardAmount: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 15, fontWeight: '500' }, pagination: { marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, paginationText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10 }, paginationButtons: { flexDirection: 'row', gap: 7 }, pageButton: { minHeight: 36, paddingHorizontal: 12 },
  modal: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }, modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,29,43,0.42)' }, drawer: { width: '92%', maxWidth: 510, height: '100%', backgroundColor: Colors.surface, boxShadow: '-14px 0 38px rgba(20,45,61,0.14)' }, drawerHeader: { minHeight: 82, paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: Colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, drawerEyebrow: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', letterSpacing: 1.1 }, drawerTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 20, fontWeight: '500', marginTop: 3 }, closeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EEF4F3', alignItems: 'center', justifyContent: 'center' }, closeText: { color: Colors.navy, fontFamily: FontFamily, fontSize: 24, lineHeight: 26 }, drawerContent: { padding: 22, paddingBottom: 32 }, drawerBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  previewSection: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.line }, previewLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', textTransform: 'uppercase' }, previewValue: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 11.5, lineHeight: 18, fontWeight: '500', marginTop: 5 }, previewPrice: { borderRadius: Radius.medium, backgroundColor: Colors.navy, padding: 16, marginTop: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, previewPriceLabel: { color: '#BFD0DC', fontFamily: FontFamily, fontSize: 10.5 }, previewPriceValue: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 20, fontWeight: '500' }, drawerSectionTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500', marginTop: 23, marginBottom: 12 }, timelineRow: { minHeight: 62, flexDirection: 'row', gap: 10 }, timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.teal, marginTop: 3 }, timelineCopy: { flex: 1, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.line }, timelineTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500' }, timelineComment: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 15, marginTop: 5 }, drawerFooter: { padding: 15, borderTopWidth: 1, borderTopColor: Colors.line, flexDirection: 'row', gap: 8 }, drawerPrimary: { flex: 1, minHeight: 42, paddingHorizontal: 10 },
});
