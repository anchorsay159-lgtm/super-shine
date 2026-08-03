import type { BusinessSettings, CartLine, Coupon, CustomerOrder, LanguageCode, LaundryService, OrderStatus, PaymentStatus, PickupSlot } from './types';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'requested', 'pickup_confirmed', 'picked_up', 'received', 'cleaning', 'quality_check',
  'out_for_delivery', 'waiting_price_approval', 'payment_verification_required', 'on_hold',
];

export const ORDER_STATUS_PROGRESS: Record<OrderStatus, number> = {
  requested: 8, payment_verification_required: 8, pickup_confirmed: 18, picked_up: 32,
  received: 45, waiting_price_approval: 48, cleaning: 62, quality_check: 76,
  out_for_delivery: 90, delivered: 100, completed: 100, on_hold: 45,
  rejected: 0, withdrawn: 0,
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  requested: 'Requested', pickup_confirmed: 'Pickup confirmed', picked_up: 'Picked up',
  received: 'Received', cleaning: 'Cleaning', quality_check: 'Quality check',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', completed: 'Completed',
  waiting_price_approval: 'Price approval', payment_verification_required: 'Payment verification',
  on_hold: 'On hold', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending', waiting_verification: 'Pending verification', verified: 'Verified',
  rejected: 'Rejected', paid: 'Paid', outstanding: 'Outstanding', refunded: 'Refunded',
};

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function normalizeThaiPhone(value: string) {
  const digits = value.trim().replace(/\D/g, '');
  if (/^0[689]\d{8}$/.test(digits)) return `+66${digits.slice(1)}`;
  if (/^66[689]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export function formatMoney(value: number, language: LanguageCode = 'en') {
  return new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US', {
    style: 'currency', currency: 'THB', maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateTime(value: string | null | undefined, language: LanguageCode = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function couponEligibleBase(coupon: Coupon, subtotal: number, pickupFee: number, deliveryFee: number, services: LaundryService[], lines: CartLine[]) {
  if (coupon.discountTarget === 'pickup_fee') return Math.max(0, pickupFee);
  if (coupon.discountTarget === 'delivery_fee') return Math.max(0, deliveryFee);
  if (coupon.discountTarget === 'pickup_and_delivery') return Math.max(0, pickupFee) + Math.max(0, deliveryFee);
  const eligible = coupon.eligibleServiceIds.length ? new Set(coupon.eligibleServiceIds) : null;
  if (!eligible) return Math.max(0, subtotal);
  return lines.reduce((sum, line) => {
    const service = services.find((item) => item.id === line.serviceId);
    return sum + (service && eligible.has(service.id) ? service.price * line.quantity : 0);
  }, 0);
}

export function calculateCouponDiscount(coupon: Coupon, subtotal: number, pickupFee: number, deliveryFee: number, services: LaundryService[], lines: CartLine[]) {
  const base = couponEligibleBase(coupon, subtotal, pickupFee, deliveryFee, services, lines);
  if (base <= 0) return 0;
  if (coupon.discountType === 'free') return base;
  if (coupon.discountType === 'fixed_amount') return Math.min(base, Math.max(0, coupon.discountValue));
  const calculated = base * Math.min(100, Math.max(0, coupon.discountValue)) / 100;
  return Math.min(base, coupon.maxDiscount == null ? calculated : Math.max(0, coupon.maxDiscount), calculated);
}

export function calculateOrderPreview(lines: CartLine[], services: LaundryService[], settings: BusinessSettings, coupon?: Coupon | null) {
  const subtotal = lines.reduce((sum, line) => {
    const service = services.find((item) => item.id === line.serviceId);
    return sum + (service ? service.price * Math.max(0, line.quantity) : 0);
  }, 0);
  const discount = coupon ? calculateCouponDiscount(coupon, subtotal, settings.pickupFee, settings.deliveryFee, services, lines) : 0;
  return { subtotal, pickupFee: settings.pickupFee, deliveryFee: settings.deliveryFee, discount, total: Math.max(0, subtotal + settings.pickupFee + settings.deliveryFee - discount) };
}

export function isSlotAvailable(slot: PickupSlot) { return slot.enabled && slot.bookedCount < slot.capacity; }
export function orderIsActive(order: CustomerOrder) { return ACTIVE_ORDER_STATUSES.includes(order.status); }

export const DEFAULT_SETTINGS: BusinessSettings = {
  storeName: 'Super Shine', timezone: 'Asia/Bangkok', currency: 'THB', openTime: '08:00:00',
  closeTime: '21:00:00', manualStatus: 'automatic', pickupFee: 0, deliveryFee: 30,
  businessPhone: '', lineUrl: '', serviceAreas: [], appVersion: '1.4.0',
};

export const DEMO_SERVICES: LaundryService[] = [
  { id: 'wash-fold', name: 'Wash & Fold', nameKey: 'service.wash_fold', description: 'Everyday laundry, washed, dried, and neatly folded.', descriptionKey: '', price: 70, priceUnit: 'kg', pricingType: 'estimated', turnaroundHours: 24, icon: 'laundry', enabled: true, sortOrder: 1, options: [] },
  { id: 'dry-clean', name: 'Dry Cleaning', nameKey: 'service.dry_clean', description: 'Careful cleaning for delicate garments and formal wear.', descriptionKey: '', price: 120, priceUnit: 'item', pricingType: 'estimated', turnaroundHours: 48, icon: 'dry-cleaning', enabled: true, sortOrder: 2, options: [] },
  { id: 'bedding', name: 'Bedding Care', nameKey: 'service.bedding', description: 'Fresh, hygienic care for sheets, duvets, and blankets.', descriptionKey: '', price: 180, priceUnit: 'item', pricingType: 'estimated', turnaroundHours: 48, icon: 'bed', enabled: true, sortOrder: 3, options: [] },
];

export const DEMO_SLOTS: PickupSlot[] = [1, 2, 3].map((offset) => {
  const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  return { id: `demo-slot-${offset}`, date, startTime: '10:00:00', endTime: '12:00:00', capacity: 8, bookedCount: offset, enabled: true };
});
