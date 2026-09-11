import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { AdminCard, AdminPage, ErrorState, SectionTitle, StatusBadge } from '@/admin/admin-ui';
import { ORDER_SELECT, ORDER_STATUS_CONFIG, PAYMENT_STATUS_CONFIG, isClosedStatus, primaryNextStatus, readablePreferences, statusLabel, validNextStatuses } from '@/admin/order-config';
import { Button } from '@/components/super-ui';
import { AdminDriverTaskCard } from '@/components/admin-driver-task-card';
import { Colors, FontFamily, FontFamilyMedium, Radius } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht, formatBangkokDate, mapOrder, mapPickupSlot } from '@/lib/domain';
import { COLLECTION_METHOD_LABELS, RETURN_METHOD_LABELS } from '@/lib/order-workflow';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder, OrderStatus, PickupSlot } from '@/types/domain';

type SupportMessage = { id: string; sender_role: 'customer' | 'admin'; message: string; reason: string; read_at?: string | null; created_at: string };
type UploadedFile = { id: string; file_type: string; storage_path: string; created_at: string; url?: string };
type LineDelivery = { event_type: string; status: string; attempts: number; last_error?: string | null; created_at: string; sent_at?: string | null };
const QUICK_REPLIES = ['Your order has been confirmed.', 'We are checking your order and will update you shortly.', 'Your laundry is ready for delivery.', 'Please upload a clearer payment slip.'];
const ORDER_DETAIL_SELECT = ORDER_SELECT.replace(', support_messages(*)', '');

function adminErrorMessage(error?: { message?: string; code?: string } | null) {
  const value = `${error?.code || ''} ${error?.message || ''}`;
  if (value.includes('FINAL_PRICE_NOT_ALLOWED')) return 'Final price cannot be changed at the current order stage.';
  if (value.includes('PAYMENT_REQUIRED_FOR_COMPLETION')) return 'This order cannot be completed until payment is received.';
  if (value.includes('OUTSTANDING_REASON_REQUIRED')) return 'Enter a reason before marking this payment outstanding.';
  if (value.includes('CASH_HANDOFF_NOT_ALLOWED') || value.includes('DELIVERY_NOT_ALLOWED')) return 'This handoff action is not available at the current order stage.';
  if (value.includes('PAYMENT_NOT_SUBMITTED')) return 'No submitted PromptPay payment is ready for review.';
  if (value.includes('PAYMENT_NOT_PENDING')) return 'No pending PromptPay confirmation is ready for review.';
  if (value.includes('FAILURE_REASON_REQUIRED')) return 'Enter a reason before marking this payment failed.';
  return 'The change could not be saved. Please try again.';
}

export default function AdminOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useApp();
  const { width } = useWindowDimensions();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [reply, setReply] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [finalTotal, setFinalTotal] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmedAmount, setConfirmedAmount] = useState('');
  const [outstandingReason, setOutstandingReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const orderRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stacked = width < 980;

  const loadMessages = useCallback(async () => {
    if (!supabase || !id || profile.role !== 'admin') return;
    const result = await supabase.from('support_messages').select('*').eq('order_id', id).order('created_at');
    if (result.error) {
      setError('Live conversation updates are temporarily unavailable.');
      return;
    }
    const support = ((result.data || []) as SupportMessage[])
      .filter((message, index, all) => all.findIndex((item) => item.id === message.id) === index)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    setMessages(support);
    const unreadIds = support.filter((message) => message.sender_role === 'customer' && !message.read_at).map((message) => message.id);
    if (unreadIds.length) void supabase.from('support_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
  }, [id, profile.role]);

  const load = useCallback(async (quiet = false) => {
    if (!supabase || !id || profile.role !== 'admin') return;
    if (!quiet) setLoading(true);
    setError('');
    const [orderResult, filesResult, slotResult] = await Promise.all([
      supabase.from('orders').select(ORDER_DETAIL_SELECT).eq('id', id).single(),
      supabase.from('uploaded_files').select('*').eq('order_id', id).order('created_at'),
      supabase.from('pickup_slots').select('*').gte('slot_date', new Date().toISOString().slice(0,10)).order('slot_date').order('start_time'),
    ]);
    if (!quiet) setLoading(false);
    const queryError = orderResult.error || filesResult.error || slotResult.error;
    if (queryError) return setError('We could not load this order. Please try again.');
    const mapped = mapOrder(orderResult.data);
    setOrder(mapped); setPrivateNote(mapped.adminPrivateComment || ''); setFinalTotal(mapped.finalTotal == null ? '' : String(mapped.finalTotal));
    const signedFiles = await Promise.all((filesResult.data || []).map(async (file) => { const signed = await supabase!.storage.from('order-uploads').createSignedUrl(file.storage_path, 900); return { ...file, url: signed.data?.signedUrl }; }));
    setFiles(signedFiles);
    setSlots((slotResult.data || []).map(mapPickupSlot));
    setSelectedDate(mapped.pickupDate || (slotResult.data?.[0]?.slot_date ?? ''));
  }, [id, profile.role]);

  const scheduleOrderRefresh = useCallback(() => {
    if (orderRefreshTimer.current) clearTimeout(orderRefreshTimer.current);
    orderRefreshTimer.current = setTimeout(() => {
      orderRefreshTimer.current = null;
      void load(true);
    }, 80);
  }, [load]);

  useEffect(() => { void load(); void loadMessages(); }, [load, loadMessages]);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setFeedback(''), 3400); return () => clearTimeout(timer); }, [feedback]);
  useEffect(() => {
    if (!supabase || !id || profile.role !== 'admin') return;
    const client = supabase;

    let orderChannel: RealtimeChannel | null = null;
    let conversationChannel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      const orderName = `admin-order-operations:${id}`;
      const conversationName = `admin-order-conversation:${id}`;
      const existing = client.getChannels().filter((item) => item.topic === `realtime:${orderName}` || item.topic === `realtime:${conversationName}`);
      await Promise.all(existing.map((item) => client.removeChannel(item)));
      if (cancelled) return;
      orderChannel = client.channel(orderName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, scheduleOrderRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${id}` }, scheduleOrderRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${id}` }, scheduleOrderRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${id}` }, scheduleOrderRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'uploaded_files', filter: `order_id=eq.${id}` }, scheduleOrderRefresh)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') scheduleOrderRefresh();
          if (__DEV__ && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) console.warn('admin_order_realtime_state', { status });
        });
      conversationChannel = client.channel(conversationName)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `order_id=eq.${id}` }, () => void loadMessages())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages', filter: `order_id=eq.${id}` }, () => void loadMessages())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void loadMessages();
          if (__DEV__ && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) console.warn('admin_conversation_realtime_state', { status });
        });
    })();

    const recover = () => { scheduleOrderRefresh(); void loadMessages(); };
    const visible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') recover(); };
    if (typeof window !== 'undefined') { window.addEventListener('focus', recover); window.addEventListener('online', recover); }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);

    return () => {
      cancelled = true;
      if (orderRefreshTimer.current) clearTimeout(orderRefreshTimer.current);
      if (orderChannel) void client.removeChannel(orderChannel);
      if (conversationChannel) void client.removeChannel(conversationChannel);
      if (typeof window !== 'undefined') { window.removeEventListener('focus', recover); window.removeEventListener('online', recover); }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
    };
  }, [id, loadMessages, profile.role, scheduleOrderRefresh]);

  const dates = [...new Set(slots.map((slot) => slot.date))];
  const dateSlots = slots.filter((slot) => slot.date === selectedDate);
  const chosenSlot = slots.find((slot) => slot.id === selectedSlot);
  const itemPreferences = useMemo(() => order?.items.flatMap((item) => readablePreferences(item.preferences).map((label) => `${item.serviceName}: ${label}`)) || [], [order]);
  const orderPreferences = order ? readablePreferences(order.preferences) : [];

  async function mutate(action: () => PromiseLike<{ error: { message: string; code?: string } | null }>, success: string) {
    if (saving) return false;
    setSaving(true); setError('');
    try {
      const result = await action();
      if (result.error) { setError(adminErrorMessage(result.error)); return false; }
      setFeedback(success); await load(true);
      return true;
    } catch {
      setError('The change could not be saved. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateStatus(nextStatus: OrderStatus) {
    const client = supabase;
    if (!client || !order) return;
    if (!validNextStatuses(order).includes(nextStatus) && nextStatus !== 'cancelled') return setError(`Cannot move ${statusLabel(order.status)} to ${statusLabel(nextStatus)} for this fulfillment method.`);
    void mutate(() => client.rpc('admin_update_order_status_v20', { p_order_id: order.databaseId, p_next_status: nextStatus, p_comment: statusComment.trim() || `Updated to ${statusLabel(nextStatus)} by admin` }), `Order moved to ${statusLabel(nextStatus)}.`);
  }

  function cancelOrder() {
    if (!order) return;
    Alert.alert('Cancel this order?', 'The customer will see that this order was cancelled. This action cannot advance the order further.', [{ text: 'Keep order', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: () => updateStatus('cancelled') }]);
  }

  function savePrivateNote() { const client = supabase; if (!client || !order) return; void mutate(() => client.from('orders').update({ admin_private_comment: privateNote.trim() }).eq('id', order.databaseId), 'Private note saved.'); }
  function confirmFinalPrice() { const client = supabase; if (!client || !order) return; const total = Number(finalTotal); if (!Number.isFinite(total) || total < 0) return setError('Enter a valid final price.'); const changed = Math.abs(total - order.estimatedTotal) > 0.009; void mutate(() => client.rpc('admin_set_final_price_v18', { p_order_id: order.databaseId, p_final_total: total }), changed ? 'Price approval requested.' : 'Final price confirmed.'); }
  function updatePayment(paymentStatus: 'paid' | 'failed') { const client = supabase; if (!client || !order) return; const reason = rejectionReason.trim(); const amount = confirmedAmount.trim() ? Number(confirmedAmount) : order.amount; if (!Number.isFinite(amount) || amount < 0) return setError('Enter a valid confirmed amount.'); if (paymentStatus === 'failed' && reason.length < 3) return setError('Enter a short failure reason for the customer.'); const run = () => void mutate(() => client.rpc('admin_update_payment_v19', { p_order_id: order.databaseId, p_status: paymentStatus, p_reason: paymentStatus === 'failed' ? reason : '', p_confirmed_amount: amount }), paymentStatus === 'failed' ? 'Payment marked failed.' : Math.abs(amount - order.amount) >= 0.01 ? 'Amount mismatch recorded as a failed payment.' : 'Payment confirmed and marked paid.'); if (paymentStatus === 'failed') Alert.alert('Mark this payment failed?', 'The customer will see the reason and can try again or change payment method.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark failed', style: 'destructive', onPress: run }]); else run(); }
  function handoff(paymentReceived: boolean) { const client = supabase; if (!client || !order) return; const reason = outstandingReason.trim(); if (!paymentReceived && reason.length < 3) return setError('Enter a reason before marking this payment outstanding.'); void mutate(() => client.rpc('admin_handoff_order_v18', { p_order_id: order.databaseId, p_payment_received: paymentReceived, p_reason: paymentReceived ? '' : reason }), paymentReceived ? 'Handoff and cash payment recorded.' : 'Delivery recorded with payment outstanding.'); }
  function recordPaymentReceived() { const client = supabase; if (!client || !order) return; void mutate(() => client.rpc('admin_record_payment_received_v18', { p_order_id: order.databaseId }), 'Payment received and recorded.'); }
  function reschedule() { const client = supabase; if (!client || !order || !selectedSlot) return; void mutate(() => client.rpc('admin_reschedule_order_v11', { p_order_id: order.databaseId, p_pickup_slot_id: selectedSlot }), 'Pickup time changed.'); }
  async function sendReply() { const client = supabase; if (!client || !order || !profile.id || saving) return; const message = reply.trim(); if (message.length < 2 || message.length > 1000) return setError('Replies must contain 2 to 1000 characters.'); setSaving(true); setError(''); try { const result = await client.from('support_messages').insert({ order_id: order.databaseId, user_id: order.userId, sender_id: profile.id, sender_role: 'admin', reason: 'Admin reply', message }).select('*').single(); if (result.error) return setError(adminErrorMessage(result.error)); const saved = result.data as SupportMessage; setMessages((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.created_at.localeCompare(b.created_at))); setReply(''); setFeedback('Reply sent.'); } catch { setError('The reply could not be sent. Please try again.'); } finally { setSaving(false); } }
  function removeDemo() { if (!supabase || !order?.isDemo) return; Alert.alert('Remove demo order?', 'This permanently deletes this demo order only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { const result = await supabase!.from('orders').delete().eq('id', order.databaseId).eq('is_demo', true); if (result.error) setError(adminErrorMessage(result.error)); else router.replace('/admin/orders'); } }]); }

  const primaryCandidate = order ? primaryNextStatus(order) : null;
  const paid = Boolean(order && ['paid', 'refunded'].includes(order.paymentStatus));
  const cashPickupHandoff = Boolean(order && order.status === 'ready_for_collection' && order.paymentMethod === 'cash_pickup' && !paid);
  const cashDeliveryHandoff = Boolean(order && order.status === 'out_for_delivery' && order.paymentMethod === 'cash_delivery' && !paid);
  const canMarkOutstanding = Boolean(order && ['ready_for_collection', 'out_for_delivery'].includes(order.status) && !paid);
  const canSetFinalPrice = Boolean(order && ['picked_up', 'received_at_store', 'processing'].includes(order.status) && !['paid', 'partially_paid', 'refunded'].includes(order.paymentStatus));
  const driverManagedTransition = Boolean(order && ['pickup_in_progress', 'out_for_delivery'].includes(order.status));
  const primaryBlocked = cashPickupHandoff || cashDeliveryHandoff || canMarkOutstanding || driverManagedTransition;
  const primary = primaryBlocked ? null : primaryCandidate;
  const tripTrackingPrimary = primary === 'pickup_in_progress' || primary === 'out_for_delivery';
  const alternateNext = order ? validNextStatuses(order).filter((status) => status !== primary
    && !(order.status === 'pickup_in_progress' && status === 'picked_up')
    && !(order.status === 'out_for_delivery' && status === 'delivered')) : [];
  const allowExceptions = Boolean(order && !isClosedStatus(order.status));

  return <AdminPage title={order ? `Order #${order.id}` : 'Order detail'} subtitle={order ? `${order.customerName || 'Customer'} · Created ${formatBangkokDate(order.createdAt)}` : 'Loading order details'} breadcrumb={{ label: 'Orders', onPress: () => router.replace('/admin/orders') }} actions={<><Button label="Back to orders" variant="secondary" onPress={() => router.replace('/admin/orders')} style={styles.headerButton} />{order && primary && !tripTrackingPrimary ? <Button label={`Move to ${ORDER_STATUS_CONFIG[primary].shortLabel}`} onPress={() => updateStatus(primary)} loading={saving} style={styles.headerButton} /> : null}<View><Button label="More actions" variant="secondary" onPress={() => setMoreOpen((value) => !value)} style={styles.headerButton} />{moreOpen && order ? <View style={styles.moreMenu}>{alternateNext.map((next) => <Pressable key={next} onPress={() => { setMoreOpen(false); updateStatus(next); }} style={styles.moreItem}><Text style={styles.moreText}>{ORDER_STATUS_CONFIG[next].label}</Text></Pressable>)}{allowExceptions ? <Pressable onPress={() => { setMoreOpen(false); cancelOrder(); }} style={styles.moreItem}><Text style={[styles.moreText, { color: Colors.coral }]}>Cancel order</Text></Pressable> : null}{order.isDemo ? <Pressable onPress={() => { setMoreOpen(false); removeDemo(); }} style={styles.moreItem}><Text style={[styles.moreText, { color: Colors.coral }]}>Remove demo order</Text></Pressable> : null}</View> : null}</View></>}>
    {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.teal} /></View> : null}
    {!loading && order ? <>
      {order.isDemo ? <View style={styles.demoBanner}><Text style={styles.demoBannerText}>DEMO ORDER · No real pickup, payment, or delivery</Text></View> : null}
      <AdminCard style={styles.orderHeader}><View style={styles.headerStatus}><StatusBadge label={ORDER_STATUS_CONFIG[order.status].label} tone={ORDER_STATUS_CONFIG[order.status].tone} /><StatusBadge label={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} tone={PAYMENT_STATUS_CONFIG[order.paymentStatus].tone} />{order.paymentAmountMismatch ? <StatusBadge label="Amount mismatch" tone="coral" /> : null}</View><View style={styles.headerFacts}><HeaderFact label="Pickup" value={order.pickupDate ? `${order.pickupDate} · ${order.pickupStart?.slice(0,5)}–${order.pickupEnd?.slice(0,5)}` : 'Unscheduled'} /><HeaderFact label="Service" value={order.itemSummary || order.service || '—'} /><HeaderFact label="Order total" value={formatBaht(order.amount)} strong /></View></AdminCard>
      {!order.isDemo ? <AdminDriverTaskCard orderId={order.databaseId} onChanged={() => void load(true)} /> : null}

      <View style={[styles.columns, stacked && styles.columnsStack]}>
        <View style={styles.mainColumn}>
          <SectionTitle title="Services and laundry preferences" subtitle="Items, quantities, pricing, and handling instructions" />
          <AdminCard style={styles.panel}>{order.items.map((item) => <View key={item.id || item.serviceId} style={styles.itemRow}><View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.quantity} × {item.serviceName}</Text><Text style={styles.itemMeta}>{formatBaht(item.unitPrice)} / {item.priceUnit} · {item.pricingType === 'estimated' ? 'Estimated pricing' : 'Fixed pricing'}</Text>{readablePreferences(item.preferences).length ? <View style={styles.preferenceList}>{readablePreferences(item.preferences).map((label) => <View key={label} style={styles.preferenceBadge}><Text style={styles.preferenceText}>{label}</Text></View>)}</View> : null}</View><Text style={styles.itemAmount}>{formatBaht(item.finalLineTotal ?? item.lineTotal)}</Text></View>)}{!itemPreferences.length && !orderPreferences.length ? <Text style={styles.emptyText}>No laundry preferences were added.</Text> : null}{orderPreferences.length ? <View style={styles.generalPreferences}><Text style={styles.panelLabel}>GENERAL PREFERENCES</Text><View style={styles.preferenceList}>{orderPreferences.map((label) => <View key={label} style={styles.preferenceBadge}><Text style={styles.preferenceText}>{label}</Text></View>)}</View></View> : null}</AdminCard>

          <View style={styles.sectionSpacing}><SectionTitle title="Customer instructions" /></View><AdminCard style={styles.panel}><DetailLine label="Pickup instructions" value={order.pickupInstructions || 'None'} /><DetailLine label="Customer order note" value={order.customerComment || 'None'} /></AdminCard>

          <View style={styles.sectionSpacing}><SectionTitle title="Photos and payment slips" subtitle="Private files use time-limited signed URLs" /></View><AdminCard style={styles.panel}>{files.length ? files.map((file) => <Pressable key={file.id} disabled={!file.url} onPress={() => file.url && Linking.openURL(file.url)} style={styles.fileRow}><View><Text style={styles.fileTitle}>{file.file_type.replace(/_/g, ' ')}</Text><Text style={styles.itemMeta}>{formatBangkokDate(file.created_at)}</Text></View><Text style={styles.fileLink}>Open file ›</Text></Pressable>) : <Text style={styles.emptyText}>No uploaded files for this order.</Text>}</AdminCard>

          <View style={styles.sectionSpacing}><SectionTitle title="Customer conversation" subtitle="Customer-visible messages only" /></View><AdminCard style={styles.panel}>{messages.length ? messages.map((message) => <View key={message.id} style={[styles.message, message.sender_role === 'admin' && styles.adminMessage]}><View style={styles.messageHeader}><Text style={styles.messageRole}>{message.sender_role === 'admin' ? 'Super Shine admin' : 'Customer'}</Text><Text style={styles.messageTime}>{formatBangkokDate(message.created_at)}</Text></View><Text style={styles.messageBody}>{message.message}</Text></View>) : <Text style={styles.emptyText}>No messages for this order.</Text>}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReplies}>{QUICK_REPLIES.map((template) => <Pressable key={template} onPress={() => setReply(template)} style={styles.quickReply}><Text style={styles.quickReplyText}>{template}</Text></Pressable>)}</ScrollView><TextInput value={reply} onChangeText={setReply} maxLength={1000} multiline placeholder="Write a customer-visible reply" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.area]} /><Button label="Send reply" onPress={sendReply} loading={saving} disabled={saving || reply.trim().length < 2} style={styles.controlButton} /></AdminCard>

          <View style={styles.sectionSpacing}><SectionTitle title="Status timeline" subtitle="System and staff activity history" /></View><AdminCard style={styles.timelinePanel}>{order.history.map((entry) => <View key={entry.id} style={styles.timelineRow}><View style={styles.timelineRail}><View style={styles.timelineDot} /><View style={styles.timelineLine} /></View><View style={styles.timelineContent}><Text style={styles.timelineTitle}>{ORDER_STATUS_CONFIG[entry.newStatus].label}</Text><Text style={styles.itemMeta}>{formatBangkokDate(entry.createdAt)} · {entry.actorRole}</Text>{entry.comment ? <Text style={styles.timelineComment}>{entry.comment}</Text> : null}</View></View>)}</AdminCard>
        </View>

        <View style={styles.sideColumn}>
          <SectionTitle title="Customer and schedule" />
          <AdminCard style={styles.sidePanel}><DetailLine label="Customer" value={order.customerName || 'Customer'} /><DetailLine label="Phone" value={order.contactPhone || '—'} />{!order.isDemo ? <DetailLine label="Email" value={order.customerEmail || '—'} /> : null}<DetailLine label="Collection method" value={COLLECTION_METHOD_LABELS[order.collectionMethod]} /><DetailLine label="Return method" value={RETURN_METHOD_LABELS[order.returnMethod]} />{order.pickupAddress || order.deliveryAddress ? <DetailLine label="Address" value={order.deliveryAddress || order.pickupAddress} /> : null}</AdminCard>

          {order.collectionMethod === 'home_pickup' ? <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>Pickup time</Text><Text style={styles.panelHint}>Choose a date, then an available slot.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>{dates.map((date) => <Pressable key={date} onPress={() => { setSelectedDate(date); setSelectedSlot(''); }} style={[styles.dateChip, selectedDate === date && styles.dateChipActive]}><Text style={[styles.dateChipText, selectedDate === date && styles.dateChipTextActive]}>{date}</Text></Pressable>)}</ScrollView><View style={styles.slotGrid}>{dateSlots.map((slot) => { const full = !slot.enabled || slot.bookedCount >= slot.capacity; return <Pressable key={slot.id} disabled={full} onPress={() => setSelectedSlot(slot.id)} style={[styles.slot, selectedSlot === slot.id && styles.slotActive, full && styles.slotDisabled]}><Text style={[styles.slotTime, selectedSlot === slot.id && styles.slotTimeActive]}>{slot.startTime.slice(0,5)}–{slot.endTime.slice(0,5)}</Text><Text style={styles.slotCapacity}>{full ? 'Full' : `${slot.capacity - slot.bookedCount} open`}</Text></Pressable>; })}</View>{chosenSlot ? <View style={styles.slotSummary}><Text style={styles.slotSummaryLabel}>Selected slot</Text><Text style={styles.slotSummaryValue}>{chosenSlot.date} · {chosenSlot.startTime.slice(0,5)}–{chosenSlot.endTime.slice(0,5)}</Text></View> : null}<Button label="Confirm pickup change" onPress={reschedule} loading={saving} disabled={!selectedSlot} style={styles.controlButton} /></AdminCard> : <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>Store drop-off</Text><Text style={styles.panelHint}>The customer will bring the laundry to the store. No pickup slot is reserved.</Text></AdminCard>}

          <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>{order.isDemo ? 'Demo payment' : 'Pricing and payment'}</Text><PriceLine label="Subtotal" value={formatBaht(order.subtotal)} /><PriceLine label="Pickup fee" value={formatBaht(order.pickupFee)} /><PriceLine label="Delivery fee" value={formatBaht(order.deliveryFee)} /><PriceLine label="Coupon discount" value={order.discount ? `−${formatBaht(order.discount)}` : '—'} /><View style={styles.priceRule} /><PriceLine label="Estimated price" value={formatBaht(order.estimatedTotal)} /><PriceLine label="Final price" value={order.finalTotal == null ? 'Not set' : formatBaht(order.finalTotal)} strong /><PriceLine label="Payment method" value={order.paymentMethod.replace(/_/g, ' ')} /><PriceLine label="Payment status" value={PAYMENT_STATUS_CONFIG[order.paymentStatus].label} />{order.amountPaid > 0 ? <PriceLine label="Amount paid" value={formatBaht(order.amountPaid)} /> : null}{order.outstandingAmount > 0 && !paid ? <><PriceLine label="Unpaid balance" value={formatBaht(order.outstandingAmount)} strong />{order.outstandingSince ? <Text style={styles.paymentReason}>Outstanding since {formatBangkokDate(order.outstandingSince)}</Text> : null}{order.outstandingReason ? <Text style={styles.paymentReason}>Reason: {order.outstandingReason}</Text> : null}<Button label="Record payment received" onPress={recordPaymentReceived} loading={saving} style={styles.controlButton} /></> : null}{order.paymentRejectionReason ? <Text style={styles.paymentReason}>Reason: {order.paymentRejectionReason}</Text> : null}<TextInput value={finalTotal} onChangeText={setFinalTotal} keyboardType="decimal-pad" placeholder="Final total in baht" placeholderTextColor={Colors.textMuted} style={styles.input} /><Button label="Confirm final price" variant="secondary" onPress={confirmFinalPrice} loading={saving} disabled={saving || !canSetFinalPrice} style={styles.controlButton} />{!canSetFinalPrice ? <Text style={styles.panelHint}>Final price cannot be changed at the current order stage.</Text> : null}{order.paymentMethod === 'promptpay' && order.paymentStatus === 'pending' ? <><Text style={styles.panelHint}>Confirm only after checking the bank transaction. The customer request is not proof of payment.</Text><TextInput value={confirmedAmount} onChangeText={setConfirmedAmount} keyboardType="decimal-pad" placeholder={`Confirmed amount (${formatBaht(order.amount)} expected)`} placeholderTextColor={Colors.textMuted} style={styles.input} /><TextInput value={rejectionReason} onChangeText={setRejectionReason} maxLength={240} placeholder="Failure reason (required when marking failed)" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.paymentReasonInput]} /><View style={styles.paymentButtons}><Button label="Mark failed" variant="secondary" onPress={() => updatePayment('failed')} disabled={saving || rejectionReason.trim().length < 3} style={styles.paymentButton} /><Button label="Confirm paid" onPress={() => updatePayment('paid')} loading={saving} style={styles.paymentButton} /></View></> : null}</AdminCard>
          {!order.isDemo ? <LineDeliveryHistory orderId={order.databaseId} /> : null}

          <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>Private admin note</Text><Text style={styles.panelHint}>Only staff members see this note.</Text><TextInput value={privateNote} onChangeText={setPrivateNote} multiline placeholder="Add a private note" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.area]} /><Button label="Save private note" variant="secondary" onPress={savePrivateNote} loading={saving} style={styles.controlButton} /></AdminCard>

          <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>Next workflow action</Text><TextInput value={statusComment} onChangeText={setStatusComment} multiline placeholder="Optional customer-visible status note" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.area]} />{cashPickupHandoff ? <Button label="Confirm collection and cash received" onPress={() => handoff(true)} loading={saving} style={styles.controlButton} /> : null}{cashDeliveryHandoff ? <Text style={styles.tripActionHint}>The assigned driver confirms delivery with the customer’s 4-digit code. Use an admin override only for an exception.</Text> : null}{canMarkOutstanding && order.returnMethod === 'store_collection' ? <><TextInput value={outstandingReason} onChangeText={setOutstandingReason} maxLength={1000} placeholder="Reason payment remains outstanding" placeholderTextColor={Colors.textMuted} style={[styles.input, styles.paymentReasonInput]} /><Button label="Mark collected, payment outstanding" variant="secondary" onPress={() => handoff(false)} disabled={saving || outstandingReason.trim().length < 3} style={styles.controlButton} /></> : null}{primary && !tripTrackingPrimary ? <Button label={`Move to ${ORDER_STATUS_CONFIG[primary].label}`} onPress={() => updateStatus(primary)} loading={saving} style={styles.controlButton} /> : tripTrackingPrimary ? <Text style={styles.tripActionHint}>Assign a driver above. Starting the trip from the driver app updates this order and begins GPS automatically.</Text> : !cashPickupHandoff && !cashDeliveryHandoff && !canMarkOutstanding ? <Text style={styles.emptyText}>{order.priceApprovalStatus === 'pending' ? 'Waiting for the customer to approve or reject the final price.' : 'No further workflow action is available.'}</Text> : null}</AdminCard>
        </View>
      </View>
    </> : null}
  </AdminPage>;
}

function HeaderFact({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <View style={styles.headerFact}><Text style={styles.factLabel}>{label}</Text><Text numberOfLines={2} style={[styles.factValue, strong && styles.factStrong]}>{value}</Text></View>; }
function DetailLine({ label, value }: { label: string; value: string }) { return <View style={styles.detailLine}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function PriceLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <View style={styles.priceLine}><Text style={styles.priceLabel}>{label}</Text><Text style={[styles.priceValue, strong && styles.priceStrong]}>{value}</Text></View>; }

function LineDeliveryHistory({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<LineDelivery[]>([]);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.rpc('admin_line_delivery_history_v1', { p_order_id: orderId }).then(({ data }) => { if (active) setRows((data || []) as LineDelivery[]); });
    return () => { active = false; };
  }, [orderId]);
  return <AdminCard style={styles.sidePanel}><Text style={styles.panelTitle}>LINE delivery</Text><Text style={styles.panelHint}>Automatic customer messages; app notifications remain separate.</Text>{rows.length ? rows.map((row, index) => <View key={`${row.event_type}-${row.created_at}-${index}`} style={styles.lineDeliveryRow}><View style={{ flex: 1 }}><Text style={styles.fileTitle}>{row.event_type.replace(/_/g, ' ')}</Text><Text style={styles.itemMeta}>{formatBangkokDate(row.created_at)} · {row.attempts} attempt{row.attempts === 1 ? '' : 's'}</Text></View><StatusBadge label={row.status} tone={row.status === 'sent' ? 'green' : row.status === 'failed' ? 'coral' : 'gray'} /></View>) : <Text style={styles.emptyText}>No LINE delivery recorded for this order.</Text>}</AdminCard>;
}

const styles = StyleSheet.create({
  headerButton: { minHeight: 40, paddingHorizontal: 13 }, feedback: { alignSelf: 'flex-end', backgroundColor: Colors.successLight, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 10 }, feedbackText: { color: Colors.success, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, loading: { minHeight: 500, alignItems: 'center', justifyContent: 'center' }, moreMenu: { position: 'absolute', right: 0, top: 46, width: 210, backgroundColor: Colors.surface, borderWidth: 0, borderRadius: Radius.medium, padding: 6, zIndex: 100, boxShadow: '0 12px 28px rgba(20,45,61,0.15)' }, moreItem: { minHeight: 39, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 10 }, moreText: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500' }, demoBanner: { borderRadius: 12, backgroundColor: Colors.blueLight, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }, demoBannerText: { color: Colors.blue, fontFamily: FontFamilyMedium, fontSize: 10, fontWeight: '500' }, orderHeader: { padding: 18, marginBottom: 18, borderTopWidth: 4, borderTopColor: Colors.teal }, headerStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, headerFacts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 }, headerFact: { flexGrow: 1, flexBasis: 220, paddingRight: 18, paddingVertical: 6 }, factLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', textTransform: 'uppercase' }, factValue: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 11.5, lineHeight: 18, fontWeight: '500', marginTop: 4 }, factStrong: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 18, fontWeight: '500' },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' }, columnsStack: { flexDirection: 'column' }, mainColumn: { flex: 1.65, minWidth: 0 }, sideColumn: { flex: 1, minWidth: 0, gap: 13 }, panel: { padding: 18 }, sidePanel: { padding: 17 }, sectionSpacing: { marginTop: 26 }, itemRow: { flexDirection: 'row', gap: 15, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.line }, itemCopy: { flex: 1 }, itemTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 12.5, fontWeight: '500' }, itemMeta: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5, marginTop: 4 }, itemAmount: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 11.5, fontWeight: '500' }, preferenceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }, preferenceBadge: { minHeight: 27, borderRadius: 9, backgroundColor: Colors.tealLight, justifyContent: 'center', paddingHorizontal: 9 }, preferenceText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500' }, generalPreferences: { paddingTop: 14 }, panelLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8, fontWeight: '500', letterSpacing: 0.8 }, emptyText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 16, paddingVertical: 8 },
  detailLine: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.line }, detailLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500', textTransform: 'uppercase' }, detailValue: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, lineHeight: 17, fontWeight: '500', marginTop: 4 }, fileRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.line }, fileTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500', textTransform: 'capitalize' }, fileLink: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500' },
  message: { backgroundColor: '#F0F5F4', borderRadius: 13, padding: 12, marginBottom: 9, marginRight: 36 }, adminMessage: { backgroundColor: Colors.tealLight, marginRight: 0, marginLeft: 36 }, messageHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, messageRole: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 8, fontWeight: '500', textTransform: 'uppercase' }, messageTime: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8 }, messageBody: { color: Colors.text, fontFamily: FontFamily, fontSize: 10.5, lineHeight: 17, marginTop: 6 }, quickReplies: { gap: 6, paddingVertical: 10 }, quickReply: { minHeight: 33, borderRadius: 10, borderWidth: 1, borderColor: Colors.line, justifyContent: 'center', paddingHorizontal: 9 }, quickReplyText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5 }, input: { minHeight: 42, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.canvas, color: Colors.text, fontFamily: FontFamily, paddingHorizontal: 11, fontSize: 10.5 }, area: { minHeight: 76, paddingTop: 10, textAlignVertical: 'top' }, controlButton: { minHeight: 42, paddingHorizontal: 12, marginTop: 9 },
  timelinePanel: { padding: 18 }, timelineRow: { flexDirection: 'row', minHeight: 70 }, timelineRail: { width: 21, alignItems: 'center' }, timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.teal, boxShadow: '0 0 0 4px rgba(11,145,133,0.12)' }, timelineLine: { flex: 1, width: 1, backgroundColor: Colors.line, marginTop: 4 }, timelineContent: { flex: 1, paddingBottom: 14 }, timelineTitle: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500' }, timelineComment: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 15, marginTop: 6 },
  panelTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' }, panelHint: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8.5, lineHeight: 14, marginTop: 3 }, tripActionHint: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 9.5, lineHeight: 16, fontWeight: '500', paddingTop: 10 }, dateRow: { gap: 6, paddingVertical: 11 }, dateChip: { height: 34, borderWidth: 0, backgroundColor: '#EEF3F2', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 }, dateChipActive: { backgroundColor: Colors.navy }, dateChipText: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 8.5, fontWeight: '500' }, dateChipTextActive: { color: Colors.surface }, slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, slot: { flexGrow: 1, flexBasis: 110, minHeight: 50, borderWidth: 1, borderColor: Colors.line, borderRadius: 11, padding: 9 }, slotActive: { backgroundColor: Colors.tealLight, borderColor: Colors.teal }, slotDisabled: { opacity: 0.42, backgroundColor: Colors.canvas }, slotTime: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500' }, slotTimeActive: { color: Colors.tealDark }, slotCapacity: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 8, marginTop: 4 }, slotSummary: { borderRadius: 11, backgroundColor: Colors.blueLight, padding: 10, marginTop: 10 }, slotSummaryLabel: { color: Colors.blue, fontFamily: FontFamilyMedium, fontSize: 8, fontWeight: '500' }, slotSummaryValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500', marginTop: 3 },
  priceLine: { minHeight: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, priceLabel: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5 }, priceValue: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 9.5, fontWeight: '500', textTransform: 'capitalize' }, priceStrong: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' }, priceRule: { height: 1, backgroundColor: Colors.line, marginVertical: 7 }, paymentReason: { color: Colors.coral, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 15, marginBottom: 8 }, paymentReasonInput: { marginTop: 9 }, paymentButtons: { flexDirection: 'row', gap: 7, marginTop: 2 }, paymentButton: { flex: 1, minHeight: 40, paddingHorizontal: 7 },
  lineDeliveryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.line },
});
