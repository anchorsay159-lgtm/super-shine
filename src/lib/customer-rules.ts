import type { Coupon, LaundryService } from '@/types/domain';

export type CustomerEligibility = {
  phoneVerified: boolean;
  verifiedPhone: string | null;
  phoneVerifiedAt: string | null;
  remainingFreePickups: number;
  eligibleCouponCodes: string[];
};

export const EMPTY_CUSTOMER_ELIGIBILITY: CustomerEligibility = {
  phoneVerified: false,
  verifiedPhone: null,
  phoneVerifiedAt: null,
  remainingFreePickups: 0,
  eligibleCouponCodes: [],
};

export function normalizeThaiPhone(value: string) {
  const digits = value.trim().replace(/\D/g, '');
  if (/^0[689]\d{8}$/.test(digits)) return `+66${digits.slice(1)}`;
  if (/^66[689]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export function freePickupDiscount(pickupFee: number, remainingFreePickups: number, _isDemo: boolean) {
  return remainingFreePickups > 0 ? Math.max(0, pickupFee) : 0;
}

export function allowedRouteParam(value: string | undefined, allowedValues: readonly string[]) {
  return value && allowedValues.includes(value) ? value : '';
}

export function claimSubmission(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function mapCustomerEligibility(value: unknown): CustomerEligibility {
  if (!value || typeof value !== 'object') return EMPTY_CUSTOMER_ELIGIBILITY;
  const row = value as Record<string, unknown>;
  return {
    phoneVerified: Boolean(row.phoneVerified),
    verifiedPhone: typeof row.verifiedPhone === 'string' ? row.verifiedPhone : null,
    phoneVerifiedAt: typeof row.phoneVerifiedAt === 'string' ? row.phoneVerifiedAt : null,
    remainingFreePickups: Math.max(0, Number(row.remainingFreePickups) || 0),
    eligibleCouponCodes: Array.isArray(row.eligibleCouponCodes)
      ? row.eligibleCouponCodes.filter((code): code is string => typeof code === 'string')
      : [],
  };
}

export function isCouponOrderEligible(
  coupon: Coupon,
  subtotal: number,
  selected: Record<string, number>,
  now = Date.now(),
  fees = { pickupFee: 0, deliveryFee: 0 },
  services: LaundryService[] = [],
) {
  if (!coupon.active) return 'This coupon is not active.';
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return 'This coupon is not available yet.';
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return 'This coupon has expired.';
  if (coupon.totalUsageLimit != null && coupon.usageCount >= coupon.totalUsageLimit) return 'This coupon has reached its usage limit.';
  if (subtotal < coupon.minimumOrder) return 'The minimum order has not been reached.';
  const eligibleIds = coupon.eligibleServiceIds.length ? coupon.eligibleServiceIds : coupon.serviceId ? [coupon.serviceId] : [];
  if (eligibleIds.length && !eligibleIds.some((id) => selected[id] > 0)) return 'Add the eligible service to use this coupon.';
  if (couponEligibleBase(coupon, subtotal, fees.pickupFee, fees.deliveryFee, services, selected) <= 0) return 'This coupon does not apply to the current order.';
  return '';
}

export function couponEligibleBase(
  coupon: Coupon,
  subtotal: number,
  pickupFee: number,
  deliveryFee: number,
  services: LaundryService[],
  selected: Record<string, number>,
) {
  if (coupon.discountTarget === 'pickup_fee') return Math.max(0, pickupFee);
  if (coupon.discountTarget === 'delivery_fee') return Math.max(0, deliveryFee);
  if (coupon.discountTarget === 'pickup_and_delivery') return Math.max(0, pickupFee) + Math.max(0, deliveryFee);
  const eligibleIds = coupon.eligibleServiceIds.length ? new Set(coupon.eligibleServiceIds) : null;
  if (!eligibleIds) return Math.max(0, subtotal);
  return services
    .filter((service) => eligibleIds.has(service.id))
    .reduce((sum, service) => sum + service.price * Math.max(0, selected[service.id] || 0), 0);
}

export function calculateCouponDiscount(
  coupon: Coupon,
  subtotal: number,
  pickupFee: number,
  deliveryFee: number,
  services: LaundryService[],
  selected: Record<string, number>,
) {
  const base = couponEligibleBase(coupon, subtotal, pickupFee, deliveryFee, services, selected);
  if (base <= 0) return 0;
  if (coupon.discountType === 'free') return base;
  if (coupon.discountType === 'fixed_amount') return Math.min(base, Math.max(0, coupon.discountValue));
  const percentage = Math.min(100, Math.max(0, coupon.discountValue));
  const calculated = base * percentage / 100;
  return Math.min(base, coupon.maxDiscount == null ? calculated : Math.max(0, coupon.maxDiscount), calculated);
}

export function couponTargetLabel(coupon: Coupon) {
  if (coupon.discountTarget === 'pickup_fee') return 'Pickup fee';
  if (coupon.discountTarget === 'delivery_fee') return 'Delivery fee';
  if (coupon.discountTarget === 'pickup_and_delivery') return 'Pickup and delivery fees';
  return coupon.eligibleServiceIds.length ? 'Eligible service subtotal' : 'Service subtotal';
}

export function customerErrorCode(message: string) {
  const known = [
    'AUTH_REQUIRED', 'AUTH_INVALID_CREDENTIALS', 'AUTH_EMAIL_NOT_CONFIRMED', 'AUTH_EMAIL_EXISTS', 'AUTH_PASSWORD_TOO_SHORT',
    'PHONE_INVALID', 'SERVICE_UNAVAILABLE', 'PICKUP_SLOT_UNAVAILABLE', 'V1_1_MIGRATION_REQUIRED',
    'COUPON_INVALID', 'COUPON_LIMIT_REACHED', 'COUPON_SERVICE_REQUIRED', 'COUPON_TARGET_UNAVAILABLE', 'COUPON_LOAD_FAILED',
    'INVALID_QUANTITY', 'INVALID_FILE_FORMAT', 'FILE_TOO_LARGE', 'PHOTO_PERMISSION_REQUIRED',
  ];
  return known.find((code) => message.includes(code)) || 'UNKNOWN_ERROR';
}
