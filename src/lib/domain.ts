import type {
  BusinessSettings,
  Coupon,
  CustomerOrder,
  LaundryService,
  OrderStatus,
  PickupSlot,
  StatusHistory,
} from '@/types/domain';
import {
  normalizeCollectionMethod, normalizeOrderStatus, normalizeReturnMethod, workflowProgress,
} from '@/lib/order-workflow';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'pending', 'accepted', 'pickup_in_progress', 'picked_up', 'awaiting_dropoff',
  'received_at_store', 'processing', 'ready', 'ready_for_collection', 'out_for_delivery',
];

export const ORDER_STATUS_PROGRESS: Record<OrderStatus, number> = {
  pending: 0.12, accepted: 0.25, pickup_in_progress: 0.38, picked_up: 0.5,
  awaiting_dropoff: 0.38, received_at_store: 0.5, processing: 0.63,
  ready: 0.75, ready_for_collection: 0.83, out_for_delivery: 0.88,
  delivered: 1, collected: 1, cancelled: 0,
};

export const STATUS_ACTION_KEY: Record<OrderStatus, string> = {
  pending: 'View order',
  accepted: 'View fulfillment details',
  pickup_in_progress: 'View pickup details',
  picked_up: 'View progress',
  awaiting_dropoff: 'View store details',
  received_at_store: 'View progress',
  processing: 'View progress',
  ready: 'View progress',
  ready_for_collection: 'View collection details',
  out_for_delivery: 'Track delivery',
  delivered: 'View receipt',
  collected: 'View receipt',
  cancelled: 'View order',
};

export function mapService(row: Record<string, any>): LaundryService {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key || row.name,
    description: row.description || '',
    descriptionKey: row.description_key || row.description || '',
    price: Number(row.price),
    priceUnit: row.price_unit,
    pricingType: row.pricing_type || 'fixed',
    turnaroundHours: row.turnaround_hours || 24,
    icon: row.icon || 'laundry',
    enabled: row.enabled,
    sortOrder: row.sort_order || 0,
    options: (row.service_options || []).map((option: Record<string, any>) => ({
      id: option.id,
      serviceId: option.service_id,
      optionKey: option.option_key,
      labelKey: option.label_key,
      inputType: option.input_type,
      choices: option.choices || [],
      required: option.is_required,
      sortOrder: option.sort_order || 0,
    })),
  };
}

export function mapCoupon(row: Record<string, any>): Coupon {
  const legacyType = row.discount_type;
  const discountTarget = row.discount_target
    || (legacyType === 'free_pickup' ? 'pickup_fee' : 'service');
  const discountType = legacyType === 'fixed'
    ? 'fixed_amount'
    : legacyType === 'free_pickup'
      ? 'free'
      : legacyType === 'service_percentage'
        ? 'percentage'
        : legacyType;
  const eligibleServiceIds = Array.isArray(row.eligible_service_ids)
    ? row.eligible_service_ids.filter((id: unknown): id is string => typeof id === 'string')
    : row.service_id ? [row.service_id] : [];
  return {
    code: row.code,
    title: row.title,
    description: row.description || '',
    discountTarget,
    discountType,
    discountValue: Number(row.discount_value),
    maxDiscount: row.max_discount == null ? null : Number(row.max_discount),
    minimumOrder: Number(row.minimum_order || 0),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    perCustomerLimit: row.per_customer_limit,
    totalUsageLimit: row.total_usage_limit,
    usageCount: row.usage_count || 0,
    serviceId: row.service_id,
    eligibleServiceIds,
    requiresVerifiedPhone: Boolean(row.requires_verified_phone),
    firstVerifiedProfileOnly: Boolean(row.first_verified_profile_only),
    active: row.active,
  };
}

export function mapPickupSlot(row: Record<string, any>): PickupSlot {
  return {
    id: row.id,
    date: row.slot_date,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    bookedCount: row.booked_count,
    enabled: row.enabled,
  };
}

export function mapSettings(row?: Record<string, any> | null): BusinessSettings {
  return {
    storeName: row?.store_name || 'Super Shine',
    timezone: row?.timezone || 'Asia/Bangkok',
    currency: row?.currency || 'THB',
    openTime: row?.open_time || '08:00:00',
    closeTime: row?.close_time || '21:00:00',
    manualStatus: row?.manual_status || 'automatic',
    pickupFee: Number(row?.pickup_fee || 0),
    deliveryFee: Number(row?.delivery_fee || 0),
    promptPayQrPath: row?.promptpay_qr_path,
    promptPayEnabled: Boolean(row?.promptpay_enabled),
    promptPayDisplayName: row?.promptpay_display_name || '',
    promptPayIdentifier: row?.promptpay_identifier || '',
    promptPayInstructions: row?.promptpay_instructions || '',
    promptPayAttemptMinutes: Number(row?.promptpay_attempt_minutes || 15),
    businessPhone: row?.business_phone || '',
    lineUrl: row?.line_url || '',
    serviceAreas: row?.service_areas || [],
    appVersion: row?.app_version || '1.1.0',
  };
}

export function mapOrder(row: Record<string, any>): CustomerOrder {
  const collectionMethod = normalizeCollectionMethod(row.collection_method);
  const returnMethod = normalizeReturnMethod(row.return_method);
  const items = (row.order_items || []).map((item: Record<string, any>) => ({
    id: item.id,
    serviceId: item.service_id,
    serviceName: item.service_name,
    serviceIcon: item.service_icon || 'laundry',
    quantity: Number(item.quantity),
    priceUnit: item.price_unit,
    unitPrice: Number(item.unit_price),
    lineTotal: Number(item.line_total),
    pricingType: item.pricing_type || 'fixed',
    preferences: item.preferences || {},
    finalQuantity: item.final_quantity == null ? null : Number(item.final_quantity),
    finalUnitPrice: item.final_unit_price == null ? null : Number(item.final_unit_price),
    finalLineTotal: item.final_line_total == null ? null : Number(item.final_line_total),
  }));
  const history: StatusHistory[] = (row.order_status_history || [])
    .map((entry: Record<string, any>) => ({
      id: entry.id,
      previousStatus: entry.previous_status ? normalizeOrderStatus(entry.previous_status, returnMethod) : null,
      newStatus: normalizeOrderStatus(entry.new_status || entry.status, returnMethod),
      actorRole: entry.actor_role || 'system',
      comment: entry.comment || entry.note || '',
      createdAt: entry.created_at,
    }))
    .sort((a: StatusHistory, b: StatusHistory) => a.createdAt.localeCompare(b.createdAt));
  const messages = (row.support_messages || [])
    .map((message: Record<string, any>) => ({
      id: message.id,
      senderRole: message.sender_role,
      message: message.message,
      readAt: message.read_at,
      createdAt: message.created_at,
    }))
    .sort((a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt));
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  const status = normalizeOrderStatus(row.status, returnMethod);
  const estimatedTotal = Number(row.estimated_total ?? row.total ?? 0);
  const finalTotal = row.final_total == null ? null : Number(row.final_total);
  const confirmationRequestedAt = row.payment_confirmation_requested_at || payment?.confirmation_requested_at || null;
  const expiresAt = row.payment_expires_at || payment?.expires_at || null;
  const rawPaymentStatus = String(row.payment_status || payment?.status || 'unpaid');
  const legacyPaymentStatus = rawPaymentStatus === 'waiting_verification' ? 'pending'
    : rawPaymentStatus === 'verified' ? 'paid'
      : rawPaymentStatus === 'rejected' ? 'failed'
        : rawPaymentStatus === 'outstanding' ? 'unpaid'
          : rawPaymentStatus === 'pending' && !confirmationRequestedAt && !payment?.slip_path ? 'unpaid'
            : rawPaymentStatus;
  const paymentStatus = legacyPaymentStatus === 'unpaid' && expiresAt && new Date(expiresAt).getTime() <= Date.now()
    ? 'expired'
    : legacyPaymentStatus as CustomerOrder['paymentStatus'];
  const amount = finalTotal ?? estimatedTotal;
  const amountPaid = Number(row.amount_paid || 0);
  const confirmedAmount = row.payment_confirmed_amount == null
    ? payment?.confirmed_amount == null ? null : Number(payment.confirmed_amount)
    : Number(row.payment_confirmed_amount);
  return {
    databaseId: row.id,
    id: row.order_number,
    userId: row.user_id,
    customerName: row.profiles?.full_name,
    customerEmail: row.profiles?.email,
    contactPhone: row.contact_phone || row.profiles?.phone || '',
    collectionMethod,
    returnMethod,
    status,
    items,
    service: items.map((item: { serviceName: string }) => item.serviceName).join(', ') || row.service_name,
    serviceIcon: items[0]?.serviceIcon || 'laundry',
    itemSummary: row.item_summary || '',
    pieces: row.item_summary || '',
    pickupSlotId: row.pickup_slot_id,
    pickupDate: row.pickup_date,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    pickupSlot: row.pickup_slot || '',
    pickupAddress: row.pickup_address || '',
    deliveryAddress: row.delivery_address || row.pickup_address || '',
    pickupLatitude: row.pickup_latitude == null ? null : Number(row.pickup_latitude),
    pickupLongitude: row.pickup_longitude == null ? null : Number(row.pickup_longitude),
    pickupLocationAccuracyMeters: row.pickup_location_accuracy_meters == null ? null : Number(row.pickup_location_accuracy_meters),
    pickupLocationCapturedAt: row.pickup_location_captured_at || null,
    deliveryLatitude: row.delivery_latitude == null ? null : Number(row.delivery_latitude),
    deliveryLongitude: row.delivery_longitude == null ? null : Number(row.delivery_longitude),
    deliveryLocationAccuracyMeters: row.delivery_location_accuracy_meters == null ? null : Number(row.delivery_location_accuracy_meters),
    deliveryLocationCapturedAt: row.delivery_location_captured_at || null,
    pickupInstructions: row.pickup_instructions || '',
    customerComment: row.customer_comment || '',
    preferences: row.preferences || {},
    subtotal: Number(row.subtotal || 0),
    pickupFee: Number(row.pickup_fee || 0),
    deliveryFee: Number(row.delivery_fee || 0),
    discount: Number(row.discount || 0),
    pickupBenefitDiscount: Number(row.pickup_benefit_discount || 0),
    couponCode: row.coupon_code || (row.is_demo ? row.coupon_code_snapshot : null),
    estimatedTotal,
    finalTotal,
    amount,
    eta: row.delivery_eta || row.expected_arrival_at || '',
    progress: workflowProgress(status, collectionMethod, returnMethod),
    pricingType: row.pricing_type || 'fixed',
    pricingStatus: row.pricing_status || (finalTotal == null ? 'estimated' : 'finalized'),
    paymentMethod: row.payment_method === 'cash' ? 'cash_delivery' : row.payment_method,
    paymentStatus,
    paymentRejectionReason: row.payment_rejection_reason || payment?.rejection_reason || '',
    paymentUpdatedAt: payment?.updated_at || null,
    paidAt: row.paid_at || payment?.paid_at || null,
    amountPaid,
    paymentReference: row.payment_reference || payment?.payment_reference || null,
    paymentExpiresAt: expiresAt,
    paymentConfirmationRequestedAt: confirmationRequestedAt,
    paymentFailureReason: row.payment_failure_reason || payment?.failure_reason || row.payment_rejection_reason || payment?.rejection_reason || '',
    paymentConfirmedAmount: confirmedAmount,
    paymentAmountMismatch: confirmedAmount != null && Math.abs(confirmedAmount - amount) >= 0.01,
    outstandingAmount: Number(row.outstanding_amount || 0),
    outstandingSince: row.outstanding_since || null,
    outstandingReason: row.outstanding_reason || '',
    hasPaymentSlip: Boolean(payment?.slip_path),
    priceApprovalStatus: row.price_approval_status || 'not_required',
    expectedArrivalAt: row.expected_arrival_at,
    deliveryEta: row.delivery_eta,
    adminPrivateComment: row.admin_private_comment,
    isDemo: Boolean(row.is_demo),
    history,
    messages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isStoreOpen(settings: BusinessSettings, now = new Date()) {
  if (settings.manualStatus === 'open') return true;
  if (settings.manualStatus === 'closed') return false;
  const bangkokTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return bangkokTime >= settings.openTime.slice(0, 5) && bangkokTime < settings.closeTime.slice(0, 5);
}

export function formatBaht(value: number) {
  return `฿${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;
}

export function formatBangkokDate(value: string | Date, language = 'en') {
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function pickupSlotLabel(slot: PickupSlot, language = 'en') {
  const date = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(`${slot.date}T00:00:00+07:00`));
  return `${date} · ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`;
}
