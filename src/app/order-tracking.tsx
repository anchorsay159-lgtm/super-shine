import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Animated, Image, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { ExpandableDetailSection, InlineError, InlineSuccess } from '@/components/customer-ui';
import { CustomerOrderGpsCard } from '@/components/customer-order-gps-card';
import { CustomerDriverTaskCard } from '@/components/customer-driver-task-card';
import { Button, Card, DetailHeader, IconBadge, Page } from '@/components/super-ui';
import { SymbolView, type SymbolName } from '@/components/symbol';
import { Colors, FontFamily, Radius, Shadow, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBaht, formatBangkokDate } from '@/lib/domain';
import { serviceSymbol } from '@/lib/icons';
import { ADMIN_STATUS_LABELS, COLLECTION_METHOD_LABELS, CUSTOMER_STATUS_LABELS, RETURN_METHOD_LABELS, customerStatusDetail, workflowStatuses } from '@/lib/order-workflow';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder, OrderStatus } from '@/types/domain';

export default function OrderTrackingScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const { activeOrder, beginPromptPayAttempt, businessSettings, changeOrderPaymentMethod, language, orders, requestPromptPayConfirmation, respondToPrice, sendOrderMessage, t, uploadOrderFile } = useApp();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState('');
  const order = orders.find((item) => item.databaseId === params.orderId) || activeOrder;
  if (!order) return <Page><DetailHeader title={t('Order details')} /><Card style={styles.empty}><Text style={styles.emptyTitle}>{t('Order not found')}</Text><Text style={styles.muted}>{t('Return to Orders and try again.')}</Text><Button label={t('View orders')} onPress={() => router.replace('/(tabs)/orders')} /></Card></Page>;

  async function priceResponse(approve: boolean) {
    setFeedback(null);
    try { await respondToPrice(order!.databaseId, approve); setFeedback({ type: 'success', message: t('Price response saved.') }); }
    catch (error) { setFeedback({ type: 'error', message: t(error instanceof Error ? error.message : 'UNKNOWN_ERROR') }); }
  }

  async function upload(fileType: 'laundry_photo' | 'stain_photo' | 'payment_slip') {
    if (uploading) return;
    setFeedback(null);
    setUploading(true);
    try { await uploadOrderFile(order!.databaseId, fileType); setFeedback({ type: 'success', message: t(fileType === 'payment_slip' ? 'Payment submitted.' : 'Upload complete') }); }
    catch (error) { setFeedback({ type: 'error', message: t(error instanceof Error ? error.message : 'UNKNOWN_ERROR') }); }
    finally { setUploading(false); }
  }

  async function sendMessage() {
    const next = message.trim();
    if (sending || next.length < 2 || next.length > 1000) return;
    setSending(true); setFeedback(null);
    try { await sendOrderMessage(order!.databaseId, next); setMessage(''); }
    catch (error) { setFeedback({ type: 'error', message: t(error instanceof Error ? error.message : 'UNKNOWN_ERROR') }); }
    finally { setSending(false); }
  }

  async function paymentAction(key: string, action: () => Promise<void>, success: string) {
    if (paymentBusy) return;
    setFeedback(null); setPaymentBusy(key);
    try { await action(); setFeedback({ type: 'success', message: t(success) }); }
    catch (error) { setFeedback({ type: 'error', message: t(error instanceof Error ? error.message : 'UNKNOWN_ERROR') }); }
    finally { setPaymentBusy(''); }
  }

  async function savePromptPayQr() {
    if (!promptPayUrl || paymentBusy) return;
    setPaymentBusy('save-qr'); setFeedback(null);
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(promptPayUrl);
        if (!response.ok) throw new Error('QR_SAVE_FAILED');
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = href; link.download = `Super-Shine-PromptPay-${order!.id}.png`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      } else {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) throw new Error('PHOTO_PERMISSION_REQUIRED');
        const target = new File(Paths.cache, `Super-Shine-PromptPay-${order!.id}.png`);
        const saved = await File.downloadFileAsync(promptPayUrl, target, { idempotent: true });
        await MediaLibrary.saveToLibraryAsync(saved.uri);
      }
      setFeedback({ type: 'success', message: t('PromptPay QR saved.') });
    } catch { setFeedback({ type: 'error', message: t('We could not save the PromptPay QR.') }); }
    finally { setPaymentBusy(''); }
  }
  const promptPayUrl = businessSettings.promptPayQrPath && supabase
    ? supabase.storage.from('business-public').getPublicUrl(businessSettings.promptPayQrPath).data.publicUrl
    : '';
  const finalPriceReady = order.finalTotal != null && ['approved', 'not_required'].includes(order.priceApprovalStatus);
  const promptPayConfigured = order.isDemo || Boolean(businessSettings.promptPayEnabled && promptPayUrl);
  const promptPayCanPay = order.paymentMethod === 'promptpay' && finalPriceReady && ['unpaid', 'failed', 'expired'].includes(order.paymentStatus);
  const cashDue = order.paymentMethod !== 'promptpay' && finalPriceReady && !['paid', 'refunded'].includes(order.paymentStatus);
  const journey = trackingJourney(order);
  const currentJourneyIndex = order.status === 'cancelled' ? -1 : journey.findIndex((stage) => stage.status === order.status);
  const orderIsLive = !['pending', 'delivered', 'collected', 'cancelled'].includes(order.status);

  return <Page>
    <DetailHeader title={['delivered', 'collected'].includes(order.status) ? t('Receipt') : t('Order progress')} />
    <View style={styles.hero}>
      <LiveOrderIcon name={serviceSymbol(order.serviceIcon)} live={orderIsLive} />
      <Text style={styles.eyebrow}>{t('ORDER')} #{order.id}</Text>
      <Text style={styles.heroTitle}>{t(CUSTOMER_STATUS_LABELS[order.status])}</Text>
      <Text style={styles.nextStep}>{t(customerStatusDetail(order.status))}</Text>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${order.progress * 100}%` }]} /></View>
      {order.deliveryEta ? <Text style={styles.heroDetail}>{t('Estimated completion: {{time}}', { time: formatBangkokDate(order.deliveryEta, language) })}</Text> : null}
      {order.isDemo ? <Text style={styles.demo}>{t('DEMO ORDER')}</Text> : null}
    </View>

    {feedback?.type === 'success' ? <InlineSuccess message={feedback.message} /> : <InlineError message={feedback?.message} />}

    {order.priceApprovalStatus === 'pending' && order.finalTotal != null ? <Card style={styles.approval}><Text style={styles.sectionTitle}>{t('Price approval required')}</Text><Text style={styles.muted}>{t('Super Shine updated the price after weighing or inspection.')}</Text><View style={styles.priceCompare}><View><Text style={styles.priceLabel}>{t('Old estimate')}</Text><Text style={styles.priceValue}>{formatBaht(order.estimatedTotal)}</Text></View><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={20} tintColor={Colors.textMuted} /><View><Text style={styles.priceLabel}>{t('New total')}</Text><Text style={styles.priceNew}>{formatBaht(order.finalTotal)}</Text></View></View><View style={styles.buttonRow}><Button label={t('Reject')} variant="secondary" onPress={() => void priceResponse(false)} style={styles.flex} /><Button label={t('Approve')} onPress={() => void priceResponse(true)} style={styles.flex} /></View></Card> : null}

    {order.paymentMethod === 'promptpay' && finalPriceReady ? <Card style={[styles.paymentCard, styles.priorityCard]}>
      <Text style={styles.paymentTitle}>{t(order.isDemo ? 'Demo payment' : 'PromptPay payment')}</Text>
      {order.isDemo ? <Text style={styles.demoPayment}>{t('No real transfer is made. This payment is only a demonstration.')}</Text> : null}
      {!promptPayConfigured ? <><Text style={styles.rejection}>{t('PromptPay is temporarily unavailable.')}</Text><Text style={styles.muted}>{t('Choose cash instead or return to this order later.')}</Text></> : null}
      {promptPayConfigured && promptPayCanPay ? <>
        {!order.isDemo && promptPayUrl ? <Image source={{ uri: promptPayUrl }} style={styles.qr} resizeMode="contain" /> : <View style={styles.demoQr}><Text style={styles.demoQrText}>{t('DEMO QR')}</Text></View>}
        <Text style={styles.amountDue}>{t('Pay exactly {{amount}}', { amount: formatBaht(order.amount) })}</Text>
        <View style={styles.referenceBox}><Text style={styles.referenceLabel}>{t('ORDER')}</Text><Text style={styles.referenceValue}>#{order.id}</Text><Text style={styles.referenceLabel}>{t('Payment reference')}</Text><Text selectable style={styles.referenceValue}>{order.paymentReference || t('Generate a payment attempt')}</Text></View>
        {businessSettings.promptPayDisplayName ? <Text style={styles.paymentState}>{businessSettings.promptPayDisplayName}</Text> : null}
        {businessSettings.promptPayIdentifier ? <Text style={styles.muted}>{businessSettings.promptPayIdentifier}</Text> : null}
        {businessSettings.promptPayInstructions ? <Text style={styles.muted}>{businessSettings.promptPayInstructions}</Text> : null}
        {order.paymentStatus === 'failed' ? <Text style={styles.rejection}>{t('Payment failed: {{reason}}', { reason: order.paymentFailureReason || t('The payment could not be confirmed.') })}</Text> : null}
        {order.paymentStatus === 'expired' ? <Text style={styles.rejection}>{t('This QR payment attempt has expired.')}</Text> : null}
        <View style={styles.buttonRow}><Button label={t('Save QR')} variant="secondary" onPress={() => void savePromptPayQr()} loading={paymentBusy === 'save-qr'} disabled={Boolean(paymentBusy) || order.isDemo} style={styles.flex} /><Button label={t(order.paymentReference ? 'I paid — request confirmation' : 'Generate QR')} onPress={() => order.paymentReference ? void paymentAction('confirm', () => requestPromptPayConfirmation(order.databaseId), 'Payment confirmation requested.') : void paymentAction('retry', () => beginPromptPayAttempt(order.databaseId, true), 'New payment attempt created.')} loading={paymentBusy === 'confirm' || paymentBusy === 'retry'} disabled={Boolean(paymentBusy)} style={styles.flex} /></View>
        {['failed', 'expired'].includes(order.paymentStatus) ? <Button label={t('Try again')} variant="secondary" onPress={() => void paymentAction('retry', () => beginPromptPayAttempt(order.databaseId, true), 'New payment attempt created.')} loading={paymentBusy === 'retry'} disabled={Boolean(paymentBusy)} /> : null}
      </> : null}
      {order.paymentStatus === 'pending' ? <><Text style={styles.paymentState}>{t('Waiting for confirmation')}</Text><Text style={styles.muted}>{t('Super Shine will mark this payment Paid only after it is confirmed. A customer-side button never confirms payment by itself.')}</Text><Button label={t(order.hasPaymentSlip ? 'Replace payment slip (fallback)' : 'Upload payment slip (fallback)')} variant="secondary" onPress={() => void upload('payment_slip')} loading={uploading} disabled={uploading || Boolean(paymentBusy)} /></> : null}
      {order.paymentStatus === 'paid' ? <><Text style={styles.paymentState}>{t('Paid ✓')}</Text><Text style={styles.muted}>{t('Payment confirmed. Your receipt has been recorded and accounting is updated automatically.')}</Text></> : null}
      {order.paymentStatus === 'partially_paid' ? <><Text style={styles.rejection}>{t('Partially paid')}</Text><Text style={styles.muted}>{t('Paid {{paid}} of {{total}}.', { paid: formatBaht(order.amountPaid), total: formatBaht(order.amount) })}</Text></> : null}
      {!['paid', 'refunded', 'partially_paid'].includes(order.paymentStatus) ? <View style={styles.recovery}><Text style={styles.recoveryTitle}>{t('Other options')}</Text><Button label={t(order.returnMethod === 'home_delivery' ? 'Change to cash on delivery' : 'Change to cash on collection')} variant="secondary" onPress={() => void paymentAction('cash', () => changeOrderPaymentMethod(order.databaseId, order.returnMethod === 'home_delivery' ? 'cash_delivery' : 'cash_pickup'), 'Payment method changed.')} disabled={Boolean(paymentBusy)} /></View> : null}
    </Card> : null}

    {cashDue ? <Card style={[styles.paymentCard, styles.priorityCard]}><Text style={styles.paymentTitle}>{t('Payment')}</Text><Text style={styles.amountDue}>{formatBaht(order.amount)}</Text><Text style={styles.paymentState}>{t(order.paymentMethod === 'cash_pickup' ? 'Cash due at collection.' : 'Cash due at delivery.')}</Text><Text style={styles.muted}>{t('Super Shine will mark this order paid after collecting the cash.')}</Text></Card> : null}
    {order.paymentMethod !== 'promptpay' && order.paymentStatus === 'paid' ? <Card style={styles.paymentCard}><Text style={styles.paymentState}>{t('Paid ✓')}</Text><Text style={styles.muted}>{t('Receipt recorded.')}</Text></Card> : null}

    <CustomerDriverTaskCard orderId={order.databaseId} status={order.status} />
    <CustomerOrderGpsCard order={order} />

    <Card style={styles.workflowCard}>
      <View style={styles.workflowHeading}><Text style={styles.paymentTitle}>{t('Your laundry journey')}</Text><Text style={styles.stageCount}>{currentJourneyIndex >= 0 ? t('Step {{current}} of {{total}}', { current: currentJourneyIndex + 1, total: journey.length }) : t('Order stopped')}</Text></View>
      <View>{journey.map((stage, index) => {
        const complete = index < currentJourneyIndex;
        const current = index === currentJourneyIndex;
        const future = currentJourneyIndex >= 0 && index > currentJourneyIndex;
        return <View key={stage.status} style={styles.journeyStage}>
          <View style={styles.markerColumn}><View style={[styles.journeyDot, complete && styles.journeyDone, current && styles.journeyCurrent]}>{complete ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={14} tintColor={Colors.surface} /> : <SymbolView name={stageIcon(stage.status)} size={15} tintColor={current ? Colors.tealDark : Colors.textMuted} />}</View>{index < journey.length - 1 ? <View style={[styles.journeyLine, index < currentJourneyIndex && styles.journeyLineDone]} /> : null}</View>
          <View style={styles.journeyCopy}><View style={styles.journeyHeading}><Text style={[styles.journeyLabel, current && styles.journeyLabelCurrent]}>{t(stage.label)}</Text>{stage.time || (future && stage.estimate) ? <Text style={styles.journeyTime}>{current ? t('Now') : stage.time ? formatBangkokTime(stage.time, language) : t(stage.estimate || '')}</Text> : null}</View><Text style={[styles.journeyDetail, current && styles.journeyDetailCurrent]}>{t(stage.detail)}</Text></View>
        </View>;
      })}</View>
    </Card>

    <View style={styles.quick}><Quick label={t(order.finalTotal == null && order.pricingType === 'estimated' ? 'Estimated total' : 'Total')} value={formatBaht(order.amount)} /><View style={styles.divider} /><Quick label={t('Payment')} value={t(`paymentStatus.${order.paymentStatus}`)} /></View>

    {!['delivered', 'collected', 'cancelled'].includes(order.status) ? <View style={styles.helpRow}><View style={styles.helpCopy}><Text style={styles.helpTitle}>{t('Plans changed?')}</Text><Text style={styles.muted}>{t('Ask our team about rescheduling this order.')}</Text></View><Button label={t('Request reschedule')} variant="secondary" onPress={() => router.push({ pathname: '/account', params: { section: 'support', orderId: order.databaseId } })} style={styles.rescheduleButton} /></View> : null}

    <View style={styles.details}><ExpandableDetailSection title={t('Services and price')} summary={`${order.items.length} · ${formatBaht(order.amount)}`} defaultOpen>{order.items.map((item) => <View key={item.id || item.serviceId} style={styles.item}><Text style={styles.itemName}>{item.quantity} × {t(item.serviceName)}</Text><Text style={styles.itemValue}>{formatBaht(item.finalLineTotal ?? item.lineTotal)}</Text></View>)}<View style={styles.rule} /><Line label={t('Subtotal')} value={formatBaht(order.subtotal)} /><Line label={t('Pickup fee')} value={formatBaht(order.pickupFee)} /><Line label={t('Delivery fee')} value={formatBaht(order.deliveryFee)} /><Line label={t('Discount')} value={`−${formatBaht(order.discount)}`} /></ExpandableDetailSection>
    <ExpandableDetailSection title={t('Fulfillment details')} summary={`${t(COLLECTION_METHOD_LABELS[order.collectionMethod])} · ${t(RETURN_METHOD_LABELS[order.returnMethod])}`}><Line label={t('Receive laundry')} value={t(COLLECTION_METHOD_LABELS[order.collectionMethod])} /><Line label={t('Return laundry')} value={t(RETURN_METHOD_LABELS[order.returnMethod])} />{order.pickupAddress ? <Line label={t('Address')} value={order.pickupAddress} /> : null}{order.collectionMethod === 'home_pickup' ? <Line label={t('Pickup window')} value={order.pickupDate ? `${order.pickupDate} · ${order.pickupStart?.slice(0, 5)}–${order.pickupEnd?.slice(0, 5)}` : t('Not scheduled')} /> : <Line label={t('Store')} value={businessSettings.storeName} />}{order.pickupInstructions ? <Line label={t('Instructions')} value={order.pickupInstructions} /> : null}</ExpandableDetailSection>
    <ExpandableDetailSection title={t('Status history')} summary={t('{{count}} updates', { count: order.history.length })}>{order.history.length ? order.history.map((entry, index) => <View key={entry.id} style={styles.timeline}><View style={styles.markerColumn}><View style={styles.marker}><View style={styles.markerInner} /></View>{index < order.history.length - 1 ? <View style={styles.line} /> : null}</View><View style={styles.flex}><Text style={styles.timelineTitle}>{t(CUSTOMER_STATUS_LABELS[entry.newStatus])}</Text><Text style={styles.muted}>{formatBangkokDate(entry.createdAt, language)}</Text>{entry.comment ? <Text style={styles.comment}>{entry.comment}</Text> : null}</View></View>) : <Text style={styles.muted}>{t('No status history available.')}</Text>}</ExpandableDetailSection>
    <ExpandableDetailSection title={t('Uploaded files')} summary={t('Add laundry or stain photos')}><View style={styles.buttonRow}><Button label={t('Upload laundry photo')} variant="secondary" onPress={() => void upload('laundry_photo')} loading={uploading} disabled={uploading || order.isDemo} style={styles.flex} /><Button label={t('Upload stain photo')} variant="secondary" onPress={() => void upload('stain_photo')} disabled={uploading || order.isDemo} style={styles.flex} /></View></ExpandableDetailSection>
    <ExpandableDetailSection title={t('Order conversation')} summary={t('{{count}} messages', { count: order.messages.length })} defaultOpen>{order.messages.length ? order.messages.map((entry) => <View key={entry.id} style={[styles.messageBubble, entry.senderRole === 'admin' && styles.adminBubble]}><Text style={styles.messageSender}>{t(entry.senderRole === 'admin' ? 'Super Shine' : 'You')} · {formatBangkokDate(entry.createdAt, language)}</Text><Text style={styles.messageBody}>{entry.message}</Text></View>) : <Text style={styles.muted}>{t('No messages yet.')}</Text>}<TextInput value={message} onChangeText={setMessage} maxLength={1000} multiline textAlignVertical="top" placeholder={t('Write a message about this order')} placeholderTextColor={Colors.textMuted} style={styles.messageInput} /><Button label={t('Send message')} onPress={() => void sendMessage()} loading={sending} disabled={sending || message.trim().length < 2} /></ExpandableDetailSection></View>
    <Button label={t('Contact support')} variant="secondary" icon={{ ios: 'message.fill', android: 'chat_bubble', web: 'chat_bubble' }} onPress={() => router.push({ pathname: '/account', params: { section: 'support', orderId: order.databaseId } })} style={styles.support} />
  </Page>;
}

function Quick({ label, value }: { label: string; value: string }) { return <View style={styles.quickItem}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.quickValue}>{value}</Text></View>; }
function Line({ label, value }: { label: string; value: string }) { return <View style={styles.item}><Text style={styles.muted}>{label}</Text><Text style={styles.lineValue}>{value}</Text></View>; }
function LiveOrderIcon({ name, live }: { name: SymbolName; live: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) { pulse.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1250, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [live, pulse]);
  return <View style={styles.liveIconWrap}>{live ? <Animated.View style={[styles.livePulse, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.45, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }] }]} /> : null}<IconBadge name={name} color={Colors.tealDark} backgroundColor={Colors.mint} badgeSize={66} size={31} /></View>;
}

function trackingJourney(order: CustomerOrder): { status: OrderStatus; label: string; detail: string; time?: string; estimate?: string }[] {
  return workflowStatuses(order.collectionMethod, order.returnMethod).map((status, index) => ({
    status,
    label: ADMIN_STATUS_LABELS[status],
    detail: trackingStageDetail(status),
    estimate: trackingStageEstimate(status),
    time: [...order.history].reverse().find((entry) => entry.newStatus === status)?.createdAt
      ?? (index === 0 ? order.createdAt : undefined),
  }));
}

function trackingStageEstimate(status: OrderStatus) {
  const estimates: Partial<Record<OrderStatus, string>> = {
    accepted: '~5 min',
    pickup_in_progress: '~25 min',
    picked_up: '~40 min',
    awaiting_dropoff: 'When dropped off',
    received_at_store: '~10 min after drop-off',
    processing: '~24–48 h',
    ready: 'After cleaning',
    ready_for_collection: 'After cleaning',
    out_for_delivery: '~25 min',
    delivered: '~40 min',
    collected: 'When collected',
  };
  return estimates[status];
}

function trackingStageDetail(status: OrderStatus) {
  const details: Record<OrderStatus, string> = {
    pending: 'We received your order and are waiting for confirmation.',
    accepted: 'Your order has been accepted.',
    pickup_in_progress: 'Your driver is travelling to your pickup address.',
    picked_up: 'Your laundry has been collected.',
    awaiting_dropoff: 'Bring your laundry to Super Shine when you are ready.',
    received_at_store: 'Your laundry has been checked in at the store.',
    processing: 'Your laundry is being cleaned with care.',
    ready: 'Your clean laundry is packed and ready for delivery.',
    ready_for_collection: 'Your clean laundry is ready to collect at the store.',
    out_for_delivery: 'Your driver is on the way to you.',
    delivered: 'Your laundry has been delivered.',
    collected: 'Your laundry has been collected from the store.',
    cancelled: 'This order has been cancelled.',
  };
  return details[status];
}

function formatBangkokTime(value: string, language: string) {
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function stageIcon(status: OrderStatus): SymbolName {
  const icons: Record<OrderStatus, SymbolName> = {
    pending: { ios: 'doc.text', android: 'receipt-text-outline', web: 'receipt-text-outline' },
    accepted: { ios: 'checkmark.circle.fill', android: 'check-circle', web: 'check-circle' },
    pickup_in_progress: { ios: 'car.fill', android: 'delivery_dining', web: 'delivery-dining' },
    picked_up: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping-outline' },
    awaiting_dropoff: { ios: 'storefront.fill', android: 'storefront', web: 'storefront-outline' },
    received_at_store: { ios: 'storefront.fill', android: 'storefront', web: 'storefront-outline' },
    processing: { ios: 'washer.fill', android: 'local_laundry_service', web: 'local_laundry_service' },
    ready: { ios: 'shippingbox.fill', android: 'package-variant-closed', web: 'package-variant-closed' },
    ready_for_collection: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping-outline' },
    out_for_delivery: { ios: 'car.fill', android: 'delivery_dining', web: 'delivery-dining' },
    delivered: { ios: 'house.fill', android: 'home', web: 'home' },
    collected: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping-outline' },
    cancelled: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  };
  return icons[status];
}
const styles = StyleSheet.create({ hero: { backgroundColor: Colors.surface, borderRadius: Radius.xlarge, padding: 20, alignItems: 'center', ...Shadow }, liveIconWrap: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' }, livePulse: { position: 'absolute', width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: Colors.teal }, eyebrow: { color: Colors.tealDark, fontFamily: FontFamily, fontSize: 10, fontWeight: '500', letterSpacing: 1.2, marginTop: Space.md }, heroTitle: { color: Colors.navy, fontFamily: FontFamily, fontSize: 24, fontWeight: '500', textAlign: 'center', marginTop: 6 }, nextStep: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: Space.sm }, heroDetail: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12, textAlign: 'center', marginTop: Space.md }, progress: { width: '100%', height: 5, borderRadius: 3, backgroundColor: Colors.line, marginTop: Space.xl }, progressFill: { height: 5, borderRadius: 3, backgroundColor: Colors.teal }, demo: { color: Colors.tealDark, fontFamily: FontFamily, fontSize: 10, fontWeight: '500', marginTop: Space.md }, holdCard: { padding: Space.lg, marginTop: Space.md, backgroundColor: Colors.coralLight }, workflowCard: { padding: 18, marginTop: Space.md }, workflowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.sm, marginBottom: 18 }, stageCount: { color: Colors.tealDark, fontFamily: FontFamily, fontSize: 10, fontWeight: '500' }, journeyStage: { minHeight: 76, flexDirection: 'row', alignItems: 'stretch' }, markerColumn: { width: 38, alignItems: 'center' }, journeyLine: { width: 2, flex: 1, backgroundColor: Colors.line }, journeyLineDone: { backgroundColor: Colors.teal }, journeyDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.line, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }, journeyDone: { backgroundColor: Colors.teal, borderColor: Colors.teal }, journeyCurrent: { backgroundColor: Colors.tealLight, borderColor: Colors.teal }, journeyCopy: { flex: 1, paddingLeft: 7, paddingBottom: 16 }, journeyHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, journeyLabel: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 14, lineHeight: 18, fontWeight: '500' }, journeyLabelCurrent: { color: Colors.navy }, journeyDetail: { color: '#9AA8AE', fontFamily: FontFamily, fontSize: 11, lineHeight: 16, marginTop: 4 }, journeyDetailCurrent: { color: Colors.textMuted }, journeyTime: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10 }, quick: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.large, paddingVertical: Space.lg, marginTop: Space.md, ...Shadow }, quickItem: { flex: 1, alignItems: 'center' }, divider: { width: 1, height: 35, backgroundColor: Colors.line }, quickValue: { color: Colors.navy, fontFamily: FontFamily, fontSize: 14, fontWeight: '500', marginTop: 4 }, helpRow: { marginTop: Space.md, borderRadius: Radius.large, backgroundColor: Colors.blueLight, padding: Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.md, flexWrap: 'wrap' }, helpCopy: { flex: 1, minWidth: 190 }, helpTitle: { color: Colors.navy, fontFamily: FontFamily, fontSize: 14, fontWeight: '500', marginBottom: 2 }, rescheduleButton: { minHeight: 44 }, paymentCard: { padding: Space.lg, marginTop: Space.md, gap: Space.md }, priorityCard: { borderWidth: 1.5, borderColor: Colors.teal }, paymentTitle: { color: Colors.navy, fontFamily: FontFamily, fontSize: 18, fontWeight: '500' }, demoPayment: { color: Colors.tealDark, fontSize: 12, lineHeight: 18, fontWeight: '600' }, amountDue: { color: Colors.navy, fontSize: 17, fontWeight: '700', textAlign: 'center' }, paymentState: { color: Colors.success, fontSize: 15, fontWeight: '700' }, rejection: { color: Colors.coral, fontSize: 12, lineHeight: 18 }, qr: { width: 220, height: 220, alignSelf: 'center' }, demoQr: { width: 220, height: 220, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: Radius.large, backgroundColor: Colors.tealLight, borderWidth: 1, borderColor: Colors.teal }, demoQrText: { color: Colors.tealDark, fontSize: 20, fontWeight: '700' }, referenceBox: { borderRadius: Radius.medium, backgroundColor: Colors.canvas, borderWidth: 1, borderColor: Colors.line, padding: Space.md, gap: 3 }, referenceLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 4 }, referenceValue: { color: Colors.navy, fontSize: 13, fontWeight: '700' }, recovery: { borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Space.md, gap: Space.sm }, recoveryTitle: { color: Colors.navy, fontSize: 12, fontWeight: '700' }, details: { gap: Space.md, marginTop: Space.xxxl }, sectionTitle: { color: Colors.navy, fontSize: 19, fontWeight: '700', marginTop: Space.xxxl, marginBottom: Space.md }, card: { padding: Space.lg, gap: Space.md }, item: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Space.lg, marginBottom: Space.sm }, itemName: { color: Colors.text, fontSize: 13, fontWeight: '600', flex: 1 }, itemValue: { color: Colors.navy, fontSize: 13, fontWeight: '700' }, lineValue: { color: Colors.text, fontSize: 12, fontWeight: '600', textAlign: 'right', flex: 1 }, muted: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11, lineHeight: 17 }, rule: { height: 1, backgroundColor: Colors.line, marginVertical: Space.sm }, timeline: { flexDirection: 'row', minHeight: 64 }, marker: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: Colors.teal, alignItems: 'center', justifyContent: 'center' }, markerInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.teal }, line: { width: 2, flex: 1, backgroundColor: Colors.tealLight }, timelineTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' }, comment: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 4 }, approval: { padding: Space.lg, marginTop: Space.md, backgroundColor: Colors.yellowLight }, priceCompare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: Space.xl }, priceLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' }, priceValue: { color: Colors.textMuted, fontSize: 17, fontWeight: '700', textDecorationLine: 'line-through', marginTop: 3 }, priceNew: { color: Colors.navy, fontSize: 21, fontWeight: '700', marginTop: 3 }, buttonRow: { flexDirection: 'row', gap: Space.md, flexWrap: 'wrap' }, flex: { flex: 1, minWidth: 130 }, messageBubble: { backgroundColor: Colors.canvas, borderRadius: Radius.medium, padding: Space.md, marginBottom: Space.sm, marginRight: Space.xxxl }, adminBubble: { backgroundColor: Colors.tealLight, marginRight: 0, marginLeft: Space.xxxl }, messageSender: { color: Colors.tealDark, fontSize: 10, fontWeight: '700' }, messageBody: { color: Colors.text, fontSize: 13, lineHeight: 19, marginTop: 4 }, messageInput: { minHeight: 92, borderWidth: 1, borderColor: Colors.line, borderRadius: Radius.medium, backgroundColor: Colors.surface, color: Colors.text, padding: Space.md, marginVertical: Space.md }, support: { marginTop: Space.xl }, empty: { padding: Space.xl, gap: Space.md }, emptyTitle: { color: Colors.navy, fontSize: 21, fontWeight: '700' } });
