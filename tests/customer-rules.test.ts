import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedRouteParam,
  calculateCouponDiscount,
  claimSubmission,
  customerErrorCode,
  freePickupDiscount,
  isCouponOrderEligible,
  mapCustomerEligibility,
  normalizeThaiPhone,
} from '../src/lib/customer-rules.ts';

const coupon = {
  code: 'FRESH20', title: 'Fresh', description: '', discountType: 'percentage' as const,
  discountTarget: 'service' as const,
  discountValue: 20, minimumOrder: 200, perCustomerLimit: 1, totalUsageLimit: 10,
  maxDiscount: null, usageCount: 2, serviceId: null, eligibleServiceIds: [], requiresVerifiedPhone: true,
  firstVerifiedProfileOnly: true, active: true,
};

const services = [
  { id: 'wash', name: 'Wash', nameKey: 'Wash', description: '', descriptionKey: '', price: 100, priceUnit: 'kg', pricingType: 'fixed' as const, turnaroundHours: 24, icon: 'shirt', enabled: true, sortOrder: 1, options: [] },
  { id: 'bedding', name: 'Bedding', nameKey: 'Bedding', description: '', descriptionKey: '', price: 300, priceUnit: 'item', pricingType: 'fixed' as const, turnaroundHours: 48, icon: 'bed', enabled: true, sortOrder: 2, options: [] },
];

test('normalizes supported Thai mobile formats to E.164', () => {
  assert.equal(normalizeThaiPhone('081 234 5678'), '+66812345678');
  assert.equal(normalizeThaiPhone('+66 81 234 5678'), '+66812345678');
  assert.equal(normalizeThaiPhone('12345'), null);
  assert.equal(normalizeThaiPhone('021234567'), null);
});

test('maps server-owned coupon eligibility and pickup balance safely', () => {
  assert.deepEqual(mapCustomerEligibility({ phoneVerified: true, verifiedPhone: '+66812345678', remainingFreePickups: 4, eligibleCouponCodes: ['FRESH20', 2] }), {
    phoneVerified: true, verifiedPhone: '+66812345678', phoneVerifiedAt: null,
    remainingFreePickups: 4, eligibleCouponCodes: ['FRESH20'],
  });
});

test('applies free pickup from the supplied account or demo balance', () => {
  assert.equal(freePickupDiscount(30, 5, false), 30);
  assert.equal(freePickupDiscount(30, 0, false), 0);
  assert.equal(freePickupDiscount(30, 5, true), 30);
});

test('checks current-order coupon conditions without trusting client usage limits', () => {
  assert.equal(isCouponOrderEligible(coupon, 200, {}), '');
  assert.equal(isCouponOrderEligible(coupon, 199, {}), 'The minimum order has not been reached.');
  assert.equal(isCouponOrderEligible({ ...coupon, usageCount: 10 }, 200, {}), 'This coupon has reached its usage limit.');
  assert.equal(isCouponOrderEligible({ ...coupon, serviceId: 'bedding', eligibleServiceIds: ['bedding'] }, 200, {}), 'Add the eligible service to use this coupon.');
});

test('calculates every coupon target and method from the intended base', () => {
  const selected = { wash: 2, bedding: 1 };
  assert.equal(calculateCouponDiscount(coupon, 500, 30, 20, services, selected), 100);
  assert.equal(calculateCouponDiscount({ ...coupon, maxDiscount: 60 }, 500, 30, 20, services, selected), 60);
  assert.equal(calculateCouponDiscount({ ...coupon, discountType: 'fixed_amount', discountValue: 700 }, 500, 30, 20, services, selected), 500);
  assert.equal(calculateCouponDiscount({ ...coupon, eligibleServiceIds: ['bedding'] }, 500, 30, 20, services, selected), 60);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'pickup_fee' }, 500, 30, 20, services, selected), 6);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'pickup_fee', discountType: 'fixed_amount', discountValue: 50 }, 500, 30, 20, services, selected), 30);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'pickup_fee', discountType: 'free', discountValue: 0 }, 500, 30, 20, services, selected), 30);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'delivery_fee', discountType: 'free', discountValue: 0 }, 500, 30, 20, services, selected), 20);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'pickup_and_delivery', discountType: 'percentage', discountValue: 50 }, 500, 30, 20, services, selected), 25);
  assert.equal(calculateCouponDiscount({ ...coupon, discountTarget: 'pickup_and_delivery', discountType: 'fixed_amount', discountValue: 40 }, 500, 30, 20, services, selected), 40);
  assert.equal(isCouponOrderEligible({ ...coupon, discountTarget: 'pickup_fee' }, 500, selected, Date.now(), { pickupFee: 0, deliveryFee: 20 }, services), 'This coupon does not apply to the current order.');
});

test('rejects stale or unavailable navigation parameters', () => {
  assert.equal(allowedRouteParam('wash-fold', ['wash-fold']), 'wash-fold');
  assert.equal(allowedRouteParam('disabled-service', ['wash-fold']), '');
  assert.equal(allowedRouteParam('used-coupon', ['FRESH20']), '');
});

test('duplicate submission lock admits one caller until released', () => {
  const lock = { current: false };
  assert.equal(claimSubmission(lock), true);
  assert.equal(claimSubmission(lock), false);
  lock.current = false;
  assert.equal(claimSubmission(lock), true);
});

test('maps known errors and hides unknown technical details', () => {
  assert.equal(customerErrorCode('serialized provider response'), 'UNKNOWN_ERROR');
  assert.equal(customerErrorCode('SERVICE_UNAVAILABLE'), 'SERVICE_UNAVAILABLE');
  assert.equal(customerErrorCode('FILE_TOO_LARGE'), 'FILE_TOO_LARGE');
});
