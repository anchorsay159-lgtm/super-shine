import type {
  BusinessSettings, Coupon, CustomerNotification, CustomerOrder, LaundryService,
  OrderItem, OrderMessage, OrderStatus, PickupSlot, StatusHistory,
} from '@supershine/shared';
import { DEFAULT_SETTINGS } from '@supershine/shared';

export const ORDER_SELECT = `
  *,
  order_items(*),
  order_status_history(*),
  payments(*),
  support_messages(*)
`;

export function mapService(row: Record<string, unknown>): LaundryService {
  const options = Array.isArray(row.service_options) ? row.service_options as Record<string, unknown>[] : [];
  return {
    id: String(row.id), name: String(row.name ?? ''), nameKey: String(row.name_key ?? row.name ?? ''),
    description: String(row.description ?? ''), descriptionKey: String(row.description_key ?? row.description ?? ''),
    price: Number(row.price ?? 0), priceUnit: String(row.price_unit ?? 'item'),
    pricingType: row.pricing_type === 'estimated' ? 'estimated' : 'fixed',
    turnaroundHours: Number(row.turnaround_hours ?? 24), icon: String(row.icon ?? 'laundry'),
    enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order ?? 0),
    options: options.map((option) => ({
      id: String(option.id), serviceId: String(option.service_id), optionKey: String(option.option_key),
      labelKey: String(option.label_key),
      inputType: (['select', 'boolean', 'text', 'photo'].includes(String(option.input_type)) ? option.input_type : 'text') as 'select' | 'boolean' | 'text' | 'photo',
      choices: Array.isArray(option.choices) ? option.choices.map(String) : [],
      required: Boolean(option.is_required), sortOrder: Number(option.sort_order ?? 0),
    })),
  };
}

export function mapCoupon(row: Record<string, unknown>): Coupon {
  const legacyType = String(row.discount_type ?? 'percentage');
  const discountTarget = String(row.discount_target ?? (legacyType === 'free_pickup' ? 'pickup_fee' : 'service')) as Coupon['discountTarget'];
  const discountType = (legacyType === 'fixed' ? 'fixed_amount' : legacyType === 'free_pickup' ? 'free' : legacyType === 'service_percentage' ? 'percentage' : legacyType) as Coupon['discountType'];
  const eligible = Array.isArray(row.eligible_service_ids)
    ? row.eligible_service_ids.filter((id): id is string => typeof id === 'string')
    : typeof row.service_id === 'string' ? [row.service_id] : [];
  return {
    code: String(row.code), title: String(row.title ?? row.code), description: String(row.description ?? ''),
    discountTarget, discountType, discountValue: Number(row.discount_value ?? 0),
    maxDiscount: row.max_discount == null ? null : Number(row.max_discount), minimumOrder: Number(row.minimum_order ?? 0),
    startsAt: typeof row.starts_at === 'string' ? row.starts_at : null, expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    perCustomerLimit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    totalUsageLimit: row.total_usage_limit == null ? null : Number(row.total_usage_limit), usageCount: Number(row.usage_count ?? 0),
    serviceId: typeof row.service_id === 'string' ? row.service_id : null, eligibleServiceIds: eligible,
    requiresVerifiedPhone: Boolean(row.requires_verified_phone), firstVerifiedProfileOnly: Boolean(row.first_verified_profile_only),
    active: Boolean(row.active),
  };
}

export function mapSlot(row: Record<string, unknown>): PickupSlot {
  return { id: String(row.id), date: String(row.slot_date), startTime: String(row.start_time), endTime: String(row.end_time), capacity: Number(row.capacity), bookedCount: Number(row.booked_count), enabled: Boolean(row.enabled) };
}

export function mapSettings(row?: Record<string, unknown> | null): BusinessSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    storeName: String(row.store_name ?? 'Super Shine'), timezone: String(row.timezone ?? 'Asia/Bangkok'),
    currency: String(row.currency ?? 'THB'), openTime: String(row.open_time ?? '08:00:00'), closeTime: String(row.close_time ?? '21:00:00'),
    manualStatus: (['automatic', 'open', 'closed'].includes(String(row.manual_status)) ? row.manual_status : 'automatic') as BusinessSettings['manualStatus'],
    pickupFee: Number(row.pickup_fee ?? 0), deliveryFee: Number(row.delivery_fee ?? 0),
    promptPayQrPath: typeof row.promptpay_qr_path === 'string' ? row.promptpay_qr_path : null,
    businessPhone: String(row.business_phone ?? ''), lineUrl: String(row.line_url ?? ''),
    serviceAreas: Array.isArray(row.service_areas) ? row.service_areas.map(String) : [], appVersion: String(row.app_version ?? '1.4.0'),
  };
}

export function mapOrder(row: Record<string, unknown>): CustomerOrder {
  const itemRows = Array.isArray(row.order_items) ? row.order_items as Record<string, unknown>[] : [];
  const historyRows = Array.isArray(row.order_status_history) ? row.order_status_history as Record<string, unknown>[] : [];
  const messageRows = Array.isArray(row.support_messages) ? row.support_messages as Record<string, unknown>[] : [];
  const paymentRows = Array.isArray(row.payments) ? row.payments as Record<string, unknown>[] : [];
  const payment = paymentRows[0];
  const items: OrderItem[] = itemRows.map((item) => ({
    id: String(item.id), serviceId: String(item.service_id ?? ''), serviceName: String(item.service_name ?? ''),
    serviceIcon: String(item.service_icon ?? 'laundry'), quantity: Number(item.quantity ?? 0), priceUnit: String(item.price_unit ?? 'item'),
    unitPrice: Number(item.unit_price ?? 0), lineTotal: Number(item.line_total ?? 0),
    pricingType: item.pricing_type === 'estimated' ? 'estimated' : 'fixed',
    preferences: typeof item.preferences === 'object' && item.preferences ? item.preferences as Record<string, unknown> : {},
  }));
  const history: StatusHistory[] = historyRows.map((entry) => ({
    id: String(entry.id), previousStatus: typeof entry.previous_status === 'string' ? entry.previous_status as OrderStatus : null,
    newStatus: String(entry.new_status ?? entry.status) as OrderStatus,
    actorRole: (entry.actor_role === 'customer' || entry.actor_role === 'admin' ? entry.actor_role : 'system') as StatusHistory['actorRole'],
    comment: String(entry.comment ?? entry.note ?? ''), createdAt: String(entry.created_at),
  })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const messages: OrderMessage[] = messageRows.map((message) => ({
    id: String(message.id), senderRole: (message.sender_role === 'admin' ? 'admin' : 'customer') as OrderMessage['senderRole'],
    message: String(message.message ?? ''), readAt: typeof message.read_at === 'string' ? message.read_at : null,
    createdAt: String(message.created_at),
  })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const estimatedTotal = Number(row.estimated_total ?? row.total ?? 0);
  const finalTotal = row.final_total == null ? null : Number(row.final_total);
  return {
    databaseId: String(row.id), id: String(row.order_number), userId: String(row.user_id),
    status: String(row.status) as OrderStatus, items, contactPhone: String(row.contact_phone ?? ''),
    pickupSlotId: typeof row.pickup_slot_id === 'string' ? row.pickup_slot_id : null,
    pickupDate: typeof row.pickup_date === 'string' ? row.pickup_date : null,
    pickupStart: typeof row.pickup_start === 'string' ? row.pickup_start : null,
    pickupEnd: typeof row.pickup_end === 'string' ? row.pickup_end : null,
    pickupAddress: String(row.pickup_address ?? ''), pickupInstructions: String(row.pickup_instructions ?? ''),
    customerComment: String(row.customer_comment ?? ''), subtotal: Number(row.subtotal ?? 0),
    pickupFee: Number(row.pickup_fee ?? 0), deliveryFee: Number(row.delivery_fee ?? 0), discount: Number(row.discount ?? 0),
    pickupBenefitDiscount: Number(row.pickup_benefit_discount ?? 0), couponCode: typeof row.coupon_code === 'string' ? row.coupon_code : null,
    estimatedTotal, finalTotal, amount: finalTotal ?? estimatedTotal,
    pricingType: row.pricing_type === 'estimated' ? 'estimated' : 'fixed',
    paymentMethod: (row.payment_method === 'cash' ? 'cash_delivery' : row.payment_method) as CustomerOrder['paymentMethod'],
    paymentStatus: String(row.payment_status ?? 'pending') as CustomerOrder['paymentStatus'],
    paymentRejectionReason: String(row.payment_rejection_reason ?? payment?.rejection_reason ?? ''),
    hasPaymentSlip: Boolean(payment?.slip_path), priceApprovalStatus: String(row.price_approval_status ?? 'not_required') as CustomerOrder['priceApprovalStatus'],
    history, messages, isDemo: Boolean(row.is_demo), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export function mapNotification(row: Record<string, unknown>): CustomerNotification {
  return { id: String(row.id), orderId: typeof row.order_id === 'string' ? row.order_id : null, type: String(row.type ?? 'order_update'), title: String(row.title ?? ''), message: String(row.body ?? ''), link: typeof row.link === 'string' ? row.link : null, readAt: typeof row.read_at === 'string' ? row.read_at : null, createdAt: String(row.created_at) };
}
